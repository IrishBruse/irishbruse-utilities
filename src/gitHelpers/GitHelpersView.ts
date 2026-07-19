import path from "path";
import {
    Command,
    Event,
    EventEmitter,
    ExtensionContext,
    SourceControl,
    ThemeIcon,
    TreeDataProvider,
    TreeItem,
    TreeItemCollapsibleState,
    TreeView,
    window,
} from "vscode";
import { Commands, Views } from "../constants";
import { getGitApi, getGitApiAsync } from "../git/getGitApi";
import { clearLegacyBranchReviewState } from "../git/clearLegacyReviewState";
import { countUnpublishedNotes, loadReviewNotes } from "../git/reviewNotes";
import { getActiveRepository, resolveActiveRepository } from "../git/resolveActiveRepository";
import { registerBaseBranchOverrideStorage } from "../git/baseBranchOverride";
import { pickBaseBranchTarget } from "../git/pickBaseBranch";
import { resolveBaseBranch } from "../git/resolveBaseBranch";
import { wireGitRepositories } from "../git/wireGitRepositories";
import { openBranchDiff } from "../git/openBranchDiff";
import { publishReviewToPR } from "../git/publishReview";
import { openPR } from "../commands/openPR";
import { getPrInfo } from "../git/githubUrl";
import { refreshOpenPrContext } from "../git/openPrContext";
import { registerCommandIB } from "../utils/vscode";
import { registerGitHelpersRefresh } from "./refresh";

export type GitHelperItemKind = "info" | "action";

export class GitHelperTreeItem extends TreeItem {
    constructor(
        public readonly kind: GitHelperItemKind,
        public readonly repoRoot: string | undefined,
        label: string,
        collapsibleState: TreeItemCollapsibleState,
        public readonly action?: "diffWithBase" | "publishReview" | "openPr",
        description?: string,
        command?: Command
    ) {
        super(label, collapsibleState);
        this.description = description;
        this.command = command;
        this.contextValue = action ? `action-${action}` : kind;
        if (action === "diffWithBase") {
            this.iconPath = new ThemeIcon("diff");
        } else if (action === "publishReview") {
            this.iconPath = new ThemeIcon("comment-discussion");
        } else if (action === "openPr") {
            this.iconPath = new ThemeIcon("git-pull-request");
        }
    }
}

export class GitHelpersViewProvider implements TreeDataProvider<GitHelperTreeItem> {
    private changeEvent = new EventEmitter<GitHelperTreeItem | undefined | null>();
    private treeView: TreeView<GitHelperTreeItem> | undefined;

    get onDidChangeTreeData(): Event<GitHelperTreeItem | undefined | null> {
        return this.changeEvent.event;
    }

    refresh(): void {
        void this.updateViewTitle();
        refreshOpenPrContext();
        this.changeEvent.fire(null);
    }

    static activate(context: ExtensionContext): GitHelpersViewProvider {
        const provider = new GitHelpersViewProvider();

        provider.treeView = window.createTreeView(Views.IbUtilitiesGitHelpers, {
            treeDataProvider: provider,
        });
        context.subscriptions.push(provider.treeView);

        void clearLegacyBranchReviewState(context);
        registerBaseBranchOverrideStorage(context);
        void provider.updateViewTitle();
        registerGitHelpersRefresh(() => provider.refresh());

        registerCommandIB(
            Commands.ShowGitHelpers,
            async () => {
                const { commands: vscodeCommands } = await import("vscode");
                await vscodeCommands.executeCommand("workbench.view.scm");
                await vscodeCommands.executeCommand(`${Views.IbUtilitiesGitHelpers}.focus`);
            },
            context
        );
        registerCommandIB(Commands.DiffWithBase, (item) => provider.runAction(item, "diffWithBase"), context);
        registerCommandIB(Commands.SetBaseBranch, (item?: GitHelperTreeItem) => pickBaseBranchTarget(item?.repoRoot), context);
        registerCommandIB(Commands.PublishReviewToPR, (item) => provider.runAction(item, "publishReview"), context);
        registerCommandIB(Commands.OpenPR, (repoPath) => provider.runOpenPr(repoPath), context);

        wireGitRepositories(context, { onChange: () => provider.refresh() });
        context.subscriptions.push(window.onDidChangeActiveTextEditor(() => provider.refresh()));

        return provider;
    }

    private async runOpenPr(repoPath?: string | SourceControl): Promise<void> {
        const repoRoot =
            typeof repoPath === "string"
                ? repoPath
                : repoPath?.rootUri?.fsPath ?? (await getActiveRepository())?.rootUri.fsPath;
        if (!repoRoot) {
            window.showWarningMessage("No active git repository. Select one in Source Control.");
            return;
        }
        const sourceControl = repoPath && typeof repoPath !== "string" ? repoPath : undefined;
        await openPR(sourceControl, repoRoot);
    }

    private async runAction(
        item: GitHelperTreeItem | string | undefined,
        action: "diffWithBase" | "publishReview"
    ): Promise<void> {
        const repoRoot =
            typeof item === "string"
                ? item
                : item?.repoRoot ?? (await getActiveRepository())?.rootUri.fsPath;
        if (!repoRoot) {
            window.showWarningMessage("No active git repository. Select one in Source Control.");
            return;
        }

        const repository = (await getActiveRepository()) ?? undefined;
        const branch = repository?.state.HEAD?.name;

        switch (action) {
            case "diffWithBase":
                await openBranchDiff(repoRoot);
                break;
            case "publishReview":
                if (branch) {
                    await publishReviewToPR(repoRoot, branch);
                    this.refresh();
                }
                break;
        }
    }

    private async updateViewTitle(): Promise<void> {
        if (!this.treeView) {
            return;
        }

        let api = getGitApi();
        if (!api) {
            api = await getGitApiAsync();
        }
        if (!api) {
            this.treeView.title = "Git Helpers";
            this.treeView.description = undefined;
            return;
        }

        if (api.repositories.length === 0) {
            this.treeView.title = "Git Helpers";
            this.treeView.description = "No repositories open";
            return;
        }

        const repository = resolveActiveRepository(api);
        if (!repository) {
            this.treeView.title = "Git Helpers";
            this.treeView.description = "Select a repository";
            return;
        }

        const repoRoot = repository.rootUri.fsPath;
        this.treeView.title = path.basename(repoRoot);
        this.treeView.description = undefined;
    }

    getTreeItem(element: GitHelperTreeItem): GitHelperTreeItem {
        return element;
    }

    async getChildren(element?: GitHelperTreeItem): Promise<GitHelperTreeItem[]> {
        if (element) {
            return [];
        }

        let api = getGitApi();
        if (!api) {
            api = await getGitApiAsync();
        }
        if (!api) {
            return [new GitHelperTreeItem("info", undefined, "Git extension unavailable", TreeItemCollapsibleState.None)];
        }

        if (api.repositories.length === 0) {
            return [new GitHelperTreeItem("info", undefined, "No git repositories open", TreeItemCollapsibleState.None)];
        }

        const repository = resolveActiveRepository(api);
        if (!repository) {
            return [
                new GitHelperTreeItem(
                    "info",
                    undefined,
                    "Select a repository in Source Control",
                    TreeItemCollapsibleState.None
                ),
            ];
        }

        const repoRoot = repository.rootUri.fsPath;
        const head = repository.state.HEAD;
        const branch = head?.name;
        const base = await resolveBaseBranch(repository);
        const pr = branch ? await getPrInfo(repoRoot, branch) : undefined;
        const notes = head?.name ? await loadReviewNotes(repoRoot, head.name) : undefined;
        const noteCount = notes ? countUnpublishedNotes(notes) : 0;

        const items: GitHelperTreeItem[] = [];

        if (head?.name && base) {
            items.push(actionItem(repoRoot, "Diff vs base", "diffWithBase", Commands.DiffWithBase, base.name));
        }

        if (pr) {
            items.push(
                new GitHelperTreeItem(
                    "action",
                    repoRoot,
                    `PR #${pr.number}: ${pr.title}`,
                    TreeItemCollapsibleState.None,
                    "openPr",
                    undefined,
                    { command: Commands.OpenPR, title: "Open PR", arguments: [repoRoot] }
                )
            );
        }

        if (noteCount > 0 && head?.name) {
            items.push(actionItem(repoRoot, "Publish to PR", "publishReview", Commands.PublishReviewToPR));
        }

        return items;
    }
}

function actionItem(
    repoRoot: string,
    label: string,
    action: "diffWithBase" | "publishReview",
    commandId: Commands,
    description?: string
): GitHelperTreeItem {
    return new GitHelperTreeItem(
        "action",
        repoRoot,
        label,
        TreeItemCollapsibleState.None,
        action,
        description,
        { command: commandId, title: label, arguments: [repoRoot] }
    );
}
