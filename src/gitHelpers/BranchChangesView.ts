import {
    Event,
    EventEmitter,
    ExtensionContext,
    TreeDataProvider,
    TreeItemCollapsibleState,
    TreeView,
    window,
} from "vscode";
import { Commands, Views } from "../constants";
import { formatPrFileChangeLabel, formatPrLineChangeDescription } from "../git/githubUrl";
import { getActiveRepository } from "../git/resolveActiveRepository";
import { registerCommandIB } from "../utils/vscode";
import { buildChangesChildren, openChangesFile, type ChangesTreeCache } from "./changesTree";
import { isGitHelpersDebugMode, showGitHelpersDebugAction } from "./debugMode";
import { GitHelperTreeItem } from "./GitHelperTreeItem";
import { getGitHelpersMockState, MOCK_REPO_ROOT } from "./mockData";
import { loadBranchChanges, type BranchChangesSummary } from "./loadBranchChanges";

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
        if (isGitHelpersDebugMode() && (!repoRoot || repoRoot === MOCK_REPO_ROOT)) {
            const mock = getGitHelpersMockState();
            this.repoRoot = mock.repoRoot;
            this.cache = mock.changesCache;
            this.summary = mock.changesSummary;
            this.updateViewDescription();
            this.changeEvent.fire(null);

            const { commands: vscodeCommands } = await import("vscode");
            await vscodeCommands.executeCommand("workbench.action.focusAuxiliaryBar");
            await vscodeCommands.executeCommand(`${Views.IbUtilitiesBranchChanges}.focus`);
            return;
        }

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
        this.treeView.description = `${formatPrFileChangeLabel(this.summary.changedFiles)} · ${formatPrLineChangeDescription(
            this.summary.additions,
            this.summary.deletions
        )}`;
    }

    private async runOpenChangesFile(
        repoRoot: string,
        mergeBaseRef: string,
        relativePath: string
    ): Promise<void> {
        if (isGitHelpersDebugMode() && repoRoot === MOCK_REPO_ROOT) {
            showGitHelpersDebugAction(`Open file diff: ${relativePath}`);
            return;
        }

        const change = this.cache?.changesByRelativePath.get(relativePath);
        await openChangesFile(repoRoot, mergeBaseRef, relativePath, change);
    }

    getTreeItem(element: GitHelperTreeItem): GitHelperTreeItem {
        return element;
    }

    async getChildren(element?: GitHelperTreeItem): Promise<GitHelperTreeItem[]> {
        if (!this.repoRoot || !this.cache) {
            return [infoItem("branch-changes:empty", "Press Changes to show changed files")];
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
