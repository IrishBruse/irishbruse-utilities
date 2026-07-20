import {
    Event,
    EventEmitter,
    ExtensionContext,
    TreeDataProvider,
    TreeItemCollapsibleState,
    TreeView,
    commands,
    window,
} from "vscode";
import { Commands, Views } from "../constants";
import { getRepositoryByRoot } from "../git/getGitApi";
import { getPrInfo, formatPrFileChangeLabel, formatPrLineChangeDescription } from "../git/githubUrl";
import { getActiveRepository } from "../git/resolveActiveRepository";
import { registerCommandIB } from "../utils/vscode";
import { buildChangesChildren, openChangesFile, type ChangesTreeCache } from "./changesTree";
import { GitHelperTreeItem } from "./GitHelperTreeItem";
import { loadBranchChanges, type BranchChangesSummary } from "./loadBranchChanges";

const BRANCH_CHANGES_HAS_PR_CONTEXT = "ib-utilities.branchChanges.hasPr";

function infoItem(id: string, label: string): GitHelperTreeItem {
    return new GitHelperTreeItem("info", undefined, label, TreeItemCollapsibleState.None, id);
}

export class BranchChangesViewProvider implements TreeDataProvider<GitHelperTreeItem> {
    private static instance: BranchChangesViewProvider | undefined;

    private changeEvent = new EventEmitter<GitHelperTreeItem | undefined | null>();
    private treeView: TreeView<GitHelperTreeItem> | undefined;
    private repoRoot: string | undefined;
    private cache: ChangesTreeCache | undefined;
    private summary: BranchChangesSummary | undefined;

    get onDidChangeTreeData(): Event<GitHelperTreeItem | undefined | null> {
        return this.changeEvent.event;
    }

    static activate(context: ExtensionContext): BranchChangesViewProvider {
        const provider = new BranchChangesViewProvider();
        BranchChangesViewProvider.instance = provider;

        provider.treeView = window.createTreeView(Views.IbUtilitiesBranchChanges, {
            treeDataProvider: provider,
            showCollapseAll: true,
        });
        context.subscriptions.push(provider.treeView);

        registerCommandIB(
            Commands.ShowBranchChanges,
            (repoRoot?: string) => provider.showForRepo(repoRoot),
            context
        );
        registerCommandIB(
            Commands.OpenChangesFile,
            (repoRoot: string, mergeBaseRef: string, relativePath: string) =>
                provider.runOpenChangesFile(repoRoot, mergeBaseRef, relativePath),
            context
        );

        return provider;
    }

    static getInstance(): BranchChangesViewProvider | undefined {
        return BranchChangesViewProvider.instance;
    }

    async showForRepo(repoRoot?: string): Promise<void> {
        const targetRoot = repoRoot ?? (await getActiveRepository())?.rootUri.fsPath;
        if (!targetRoot) {
            window.showWarningMessage("No active git repository. Select one in Source Control.");
            return;
        }

        const data = await loadBranchChanges(targetRoot);
        if (!data) {
            window.showWarningMessage("Could not load branch changes.");
            return;
        }

        this.repoRoot = targetRoot;
        this.cache = data.cache;
        this.summary = data.summary;
        this.updateViewDescription();
        this.changeEvent.fire(null);

        const repository = getRepositoryByRoot(targetRoot) ?? (await getActiveRepository());
        const branch = repository?.state.HEAD?.name;
        const pr = branch ? await getPrInfo(targetRoot, branch) : undefined;
        await commands.executeCommand("setContext", BRANCH_CHANGES_HAS_PR_CONTEXT, Boolean(pr));

        const { commands: vscodeCommands } = await import("vscode");
        await vscodeCommands.executeCommand("workbench.action.focusAuxiliaryBar");
        await vscodeCommands.executeCommand(`${Views.IbUtilitiesBranchChanges}.focus`);
    }

    private updateViewDescription(): void {
        if (!this.treeView) {
            return;
        }
        if (!this.summary) {
            this.treeView.description = undefined;
            return;
        }
        this.treeView.description = `${formatPrLineChangeDescription(
            this.summary.additions,
            this.summary.deletions
        )} · ${formatPrFileChangeLabel(this.summary.changedFiles)}`;
    }

    private async runOpenChangesFile(
        repoRoot: string,
        mergeBaseRef: string,
        relativePath: string
    ): Promise<void> {
        const change = this.cache?.changesByRelativePath.get(relativePath);
        await openChangesFile(repoRoot, mergeBaseRef, relativePath, change);
    }

    getTreeItem(element: GitHelperTreeItem): GitHelperTreeItem {
        return element;
    }

    async getChildren(element?: GitHelperTreeItem): Promise<GitHelperTreeItem[]> {
        if (!this.repoRoot || !this.cache) {
            return [infoItem("branch-changes:empty", "Press Diff to show changed files")];
        }

        if (element?.kind === "changesFolder" && element.id) {
            return buildChangesChildren(this.repoRoot, this.cache, element.id);
        }

        if (element) {
            return [];
        }

        const children = buildChangesChildren(this.repoRoot, this.cache, `${this.repoRoot}:changes`);
        if (children.length === 0) {
            return [infoItem(`${this.repoRoot}:changes:empty`, "No changed files")];
        }
        return children;
    }
}

export async function revealBranchChanges(repoRoot: string): Promise<void> {
    const provider = BranchChangesViewProvider.getInstance();
    if (!provider) {
        return;
    }
    await provider.showForRepo(repoRoot);
}
