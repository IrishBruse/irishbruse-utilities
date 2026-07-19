import path from "path";
import os from "os";
import {
    Command,
    env,
    Event,
    EventEmitter,
    ExtensionContext,
    SourceControl,
    ThemeIcon,
    TreeDataProvider,
    TreeItem,
    TreeItemCollapsibleState,
    TreeView,
    Uri,
    window,
    workspace,
} from "vscode";
import { Commands, Views } from "../constants";
import { getGitApi, getGitApiAsync, getRepositoryByRoot } from "../git/getGitApi";
import { clearLegacyBranchReviewState } from "../git/clearLegacyReviewState";
import { createBlankDraftPullRequest } from "../git/createDraftPR";
import { countUnpublishedNotes, loadReviewNotes } from "../git/reviewNotes";
import type { Repository } from "../git/gitApi";
import { getActiveRepository, resolveActiveRepository } from "../git/resolveActiveRepository";
import { registerBaseBranchOverrideStorage } from "../git/baseBranchOverride";
import { pickBaseBranchTarget } from "../git/pickBaseBranch";
import { resolveBaseBranch } from "../git/resolveBaseBranch";
import { wireGitRepositories } from "../git/wireGitRepositories";
import { openBranchDiff } from "../git/openBranchDiff";
import { publishReviewToPR } from "../git/publishReview";
import { markPullRequestReady } from "../git/markPrReady";
import { openPR } from "../commands/openPR";
import {
    formatPrFileChangeLabel,
    formatPrLineChangeDescription,
    getPrChangesUrl,
    getPrInfo,
    runGh,
} from "../git/githubUrl";
import { getFailedPrCheck } from "../git/prChecks";
import { getPrReviewStatus } from "../git/prReviewStatus";
import { getJiraBrowseUrl, getJiraWorkspace } from "../jira/jiraWorkspace";
import { extractJiraKeyFromTitle, resolveJiraKey, summaryFromPrTitle } from "../jira/jiraKey";
import { pickJiraTicketPrTitle } from "../jira/pickJiraTicketForPrTitle";
import { resolveJiraSummary } from "../jira/jiraSummary";
import { registerCommandIB } from "../utils/vscode";
import { registerGitHelpersRefresh } from "./refresh";
import { RepoChildrenCache } from "./repoChildrenCache";

export type GitHelperItemKind = "info" | "action";

export class GitHelperTreeItem extends TreeItem {
    public prUrl?: string;
    public logUrl?: string;
    public changesUrl?: string;
    public reviewUrl?: string;
    public jiraUrl?: string;
    public jiraKey?: string;

    constructor(
        public readonly kind: GitHelperItemKind,
        public readonly repoRoot: string | undefined,
        label: string,
        collapsibleState: TreeItemCollapsibleState,
        id: string,
        public readonly action?:
            | "diffWithBase"
            | "publishReview"
            | "openPr"
            | "createDraftPr"
            | "openFailedJobLog"
            | "openPrChanges"
            | "openPrReview"
            | "openJira"
            | "addJiraKeyToPrTitle",
        description?: string,
        command?: Command
    ) {
        super(label, collapsibleState);
        this.id = id;
        this.description = description;
        this.command = command;
        this.contextValue = action ? `action-${action}` : kind;
        if (action === "diffWithBase") {
            this.iconPath = new ThemeIcon("diff");
        } else if (action === "publishReview") {
            this.iconPath = new ThemeIcon("comment-discussion");
        } else if (action === "openPr") {
            this.iconPath = new ThemeIcon("git-pull-request");
        } else if (action === "createDraftPr") {
            this.iconPath = new ThemeIcon("git-pull-request-create");
        } else if (action === "openFailedJobLog") {
            this.iconPath = new ThemeIcon("warning");
        } else if (action === "openPrChanges") {
            this.iconPath = new ThemeIcon("git-compare");
        } else if (action === "openPrReview") {
            this.iconPath = new ThemeIcon("comment-discussion");
        } else if (action === "openJira") {
            this.iconPath = new ThemeIcon("issue-opened");
        } else if (action === "addJiraKeyToPrTitle") {
            this.iconPath = new ThemeIcon("warning");
        }
    }
}

function prRowDescription(pr: { title: string; isDraft: boolean }): string {
    return pr.isDraft ? `Draft · ${pr.title}` : pr.title;
}

function childrenSignature(items: readonly GitHelperTreeItem[]): string {
    return items
        .map((item) => `${item.id ?? ""}:${item.label}:${item.description ?? ""}:${item.contextValue ?? ""}`)
        .join("|");
}

function infoItem(id: string, label: string): GitHelperTreeItem {
    return new GitHelperTreeItem("info", undefined, label, TreeItemCollapsibleState.None, id);
}

function loadingItem(): GitHelperTreeItem {
    const item = infoItem("info:loading", "Loading…");
    item.iconPath = new ThemeIcon("sync~spin");
    item.contextValue = "info-loading";
    return item;
}

export class GitHelpersViewProvider implements TreeDataProvider<GitHelperTreeItem> {
    private changeEvent = new EventEmitter<GitHelperTreeItem | undefined | null>();
    private treeView: TreeView<GitHelperTreeItem> | undefined;
    private cachedChildren: GitHelperTreeItem[] = [];
    private childrenSignatureValue = "";
    private repoChildrenCache = new RepoChildrenCache<GitHelperTreeItem>();
    private displayedRepoRoot: string | undefined;
    private lastRepoRoot: string | undefined;
    private refreshTimer: ReturnType<typeof setTimeout> | undefined;
    private buildGeneration = 0;
    private creatingDraftPrFor: string | undefined;
    private markingPrReadyFor: string | undefined;

    get onDidChangeTreeData(): Event<GitHelperTreeItem | undefined | null> {
        return this.changeEvent.event;
    }

    refresh(force = false): void {
        if (force) {
            const activeRoot = this.getActiveRepoRootSync();
            if (activeRoot) {
                this.repoChildrenCache.delete(activeRoot);
            }
            this.enterLoadingState();
        } else {
            this.enterLoadingStateIfRepoChanged();
        }
        void this.updateViewTitle();
        this.scheduleChildrenRefresh();
    }

    onRepositoryUiChange(repository: Repository): void {
        const repoRoot = repository.rootUri.fsPath;
        if (!this.displayedRepoRoot) {
            return;
        }
        if (repository.ui.selected && this.displayedRepoRoot !== repoRoot) {
            this.restoreCachedOrLoading(repoRoot);
            return;
        }
        if (!repository.ui.selected && this.displayedRepoRoot === repoRoot) {
            const nextRoot = this.getActiveRepoRootSync();
            if (nextRoot) {
                this.restoreCachedOrLoading(nextRoot);
            } else {
                this.enterLoadingState();
            }
        }
    }

    private getActiveRepoRootSync(): string | undefined {
        const api = getGitApi();
        if (!api) {
            return undefined;
        }
        return resolveActiveRepository(api)?.rootUri.fsPath;
    }

    private enterLoadingStateIfRepoChanged(): void {
        const activeRoot = this.getActiveRepoRootSync();
        if (!this.displayedRepoRoot || !activeRoot || this.displayedRepoRoot === activeRoot) {
            return;
        }
        this.restoreCachedOrLoading(activeRoot);
    }

    private restoreCachedOrLoading(repoRoot: string): void {
        const cached = this.repoChildrenCache.get(repoRoot);
        if (cached) {
            ++this.buildGeneration;
            this.cachedChildren = cached.children;
            this.childrenSignatureValue = cached.signature;
            this.displayedRepoRoot = repoRoot;
            this.changeEvent.fire(null);
            return;
        }
        this.enterLoadingState();
    }

    private enterLoadingState(): void {
        ++this.buildGeneration;
        const loading = [loadingItem()];
        this.cachedChildren = loading;
        this.childrenSignatureValue = childrenSignature(loading);
        this.changeEvent.fire(null);
    }

    private scheduleChildrenRefresh(): void {
        if (this.refreshTimer) {
            clearTimeout(this.refreshTimer);
        }
        this.refreshTimer = setTimeout(() => {
            this.refreshTimer = undefined;
            void this.rebuildChildren();
        }, 50);
    }

    private applyChildren(children: GitHelperTreeItem[]): void {
        const signature = childrenSignature(children);
        if (signature === this.childrenSignatureValue) {
            return;
        }
        this.cachedChildren = children;
        this.childrenSignatureValue = signature;
        const repoRoot = children.find((item) => item.repoRoot)?.repoRoot;
        if (repoRoot) {
            this.displayedRepoRoot = repoRoot;
            this.repoChildrenCache.set(repoRoot, children, signature);
        }
        this.changeEvent.fire(null);
    }

    private async rebuildChildren(): Promise<void> {
        const generation = ++this.buildGeneration;
        const children = await this.buildChildren();
        if (generation !== this.buildGeneration) {
            return;
        }
        this.applyChildren(children);
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
        registerCommandIB(Commands.RefreshGitHelpers, () => provider.refresh(true), context);
        registerCommandIB(Commands.CreateDraftPR, (item) => provider.runCreateDraftPr(item), context);
        registerCommandIB(Commands.MarkPrReady, (item) => provider.runMarkPrReady(item), context);
        registerCommandIB(Commands.CopyPrUrl, (item) => provider.runCopyPrUrl(item), context);
        registerCommandIB(Commands.OpenFailedJobLog, (item) => provider.runOpenFailedJobLog(item), context);
        registerCommandIB(Commands.OpenPrChanges, (item) => provider.runOpenPrChanges(item), context);
        registerCommandIB(Commands.OpenPrReview, (item) => provider.runOpenPrReview(item), context);
        registerCommandIB(Commands.OpenJiraTicket, (item) => provider.runOpenJiraTicket(item), context);
        registerCommandIB(Commands.CopyJiraKey, (item) => provider.runCopyJiraKey(item), context);
        registerCommandIB(Commands.AddJiraKeyToPrTitle, (item) => provider.runAddJiraKeyToPrTitle(item), context);

        wireGitRepositories(context, {
            onChange: () => provider.refresh(),
            onRepositoryUiChange: (repository) => provider.onRepositoryUiChange(repository),
        });
        context.subscriptions.push(window.onDidChangeActiveTextEditor(() => provider.refresh()));
        context.subscriptions.push(
            workspace.onDidChangeConfiguration((event) => {
                if (event.affectsConfiguration("ib-utilities.jira.keyPattern")) {
                    provider.refresh();
                }
            })
        );
        const jiraBoardPath = path.join(os.homedir(), ".config", "jira", "board.json");
        const jiraBoardWatcher = workspace.createFileSystemWatcher(jiraBoardPath);
        jiraBoardWatcher.onDidChange(() => provider.refresh());
        jiraBoardWatcher.onDidCreate(() => provider.refresh());
        jiraBoardWatcher.onDidDelete(() => provider.refresh());
        context.subscriptions.push(jiraBoardWatcher);

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

    private async runCreateDraftPr(item: GitHelperTreeItem | string | undefined): Promise<void> {
        const repoRoot =
            typeof item === "string"
                ? item
                : item?.repoRoot ?? (await getActiveRepository())?.rootUri.fsPath;
        if (!repoRoot) {
            window.showWarningMessage("No active git repository. Select one in Source Control.");
            return;
        }

        if (this.creatingDraftPrFor === repoRoot) {
            return;
        }

        const repository = getRepositoryByRoot(repoRoot) ?? (await getActiveRepository());
        const branch = repository?.state.HEAD?.name;
        if (!repository || !branch) {
            window.showWarningMessage("No named branch checked out.");
            return;
        }

        const base = await resolveBaseBranch(repository);
        const baseBranch = base ? base.name.replace(/^origin\//, "") : "main";

        this.creatingDraftPrFor = repoRoot;
        this.changeEvent.fire(null);
        try {
            const pr = await createBlankDraftPullRequest(repoRoot, branch, baseBranch);
            if (!pr) {
                return;
            }

            this.refresh();
            await env.openExternal(Uri.parse(pr.url));
        } finally {
            if (this.creatingDraftPrFor === repoRoot) {
                this.creatingDraftPrFor = undefined;
                this.changeEvent.fire(null);
            }
        }
    }

    private async runOpenPrReview(item: GitHelperTreeItem | string | undefined): Promise<void> {
        const repoRoot =
            typeof item === "string"
                ? item
                : item?.repoRoot ?? (await getActiveRepository())?.rootUri.fsPath;
        if (!repoRoot) {
            window.showWarningMessage("No active git repository. Select one in Source Control.");
            return;
        }

        let reviewUrl = typeof item !== "string" ? item?.reviewUrl : undefined;
        if (!reviewUrl) {
            const repository = getRepositoryByRoot(repoRoot) ?? (await getActiveRepository());
            const branch = repository?.state.HEAD?.name;
            if (!branch) {
                window.showWarningMessage("No named branch checked out.");
                return;
            }

            const pr = await getPrInfo(repoRoot, branch);
            if (!pr) {
                window.showWarningMessage("No pull request found for the current branch.");
                return;
            }

            reviewUrl = (await getPrReviewStatus(repoRoot, pr.number))?.url;
        }

        if (!reviewUrl) {
            window.showWarningMessage("No PR review activity to open.");
            return;
        }

        await env.openExternal(Uri.parse(reviewUrl));
    }

    private async runOpenPrChanges(item: GitHelperTreeItem | string | undefined): Promise<void> {
        const repoRoot =
            typeof item === "string"
                ? item
                : item?.repoRoot ?? (await getActiveRepository())?.rootUri.fsPath;
        if (!repoRoot) {
            window.showWarningMessage("No active git repository. Select one in Source Control.");
            return;
        }

        let changesUrl = typeof item !== "string" ? item?.changesUrl : undefined;
        if (!changesUrl) {
            const repository = getRepositoryByRoot(repoRoot) ?? (await getActiveRepository());
            const branch = repository?.state.HEAD?.name;
            if (!branch) {
                window.showWarningMessage("No named branch checked out.");
                return;
            }

            const pr = await getPrInfo(repoRoot, branch);
            if (!pr) {
                window.showWarningMessage("No pull request found for the current branch.");
                return;
            }

            changesUrl = getPrChangesUrl(pr.url);
        }

        await env.openExternal(Uri.parse(changesUrl));
    }

    private async runOpenJiraTicket(item: GitHelperTreeItem | string | undefined): Promise<void> {
        const repoRoot =
            typeof item === "string"
                ? item
                : item?.repoRoot ?? (await getActiveRepository())?.rootUri.fsPath;
        if (!repoRoot) {
            window.showWarningMessage("No active git repository. Select one in Source Control.");
            return;
        }

        let jiraUrl = typeof item !== "string" ? item?.jiraUrl : undefined;
        if (!jiraUrl) {
            const jiraWorkspace = await getJiraWorkspace();
            const repository = getRepositoryByRoot(repoRoot) ?? (await getActiveRepository());
            const branch = repository?.state.HEAD?.name;
            const pr = branch ? await getPrInfo(repoRoot, branch) : undefined;
            const resolved = resolveJiraKey(pr?.title, branch, jiraWorkspace?.keyPattern ?? /[A-Z][A-Z0-9_]*-\d+/);
            if (!jiraWorkspace || !resolved) {
                window.showWarningMessage("No Jira ticket available.");
                return;
            }
            jiraUrl = getJiraBrowseUrl(jiraWorkspace.baseUrl, resolved.key);
        }

        await env.openExternal(Uri.parse(jiraUrl));
    }

    private async runCopyJiraKey(item: GitHelperTreeItem | string | undefined): Promise<void> {
        const repoRoot =
            typeof item === "string"
                ? item
                : item?.repoRoot ?? (await getActiveRepository())?.rootUri.fsPath;
        if (!repoRoot) {
            window.showWarningMessage("No active git repository. Select one in Source Control.");
            return;
        }

        let jiraKey = typeof item !== "string" ? item?.jiraKey : undefined;
        if (!jiraKey) {
            const jiraWorkspace = await getJiraWorkspace();
            const repository = getRepositoryByRoot(repoRoot) ?? (await getActiveRepository());
            const branch = repository?.state.HEAD?.name;
            const pr = branch ? await getPrInfo(repoRoot, branch) : undefined;
            jiraKey = resolveJiraKey(pr?.title, branch, jiraWorkspace?.keyPattern ?? /[A-Z][A-Z0-9_]*-\d+/)?.key;
        }

        if (!jiraKey) {
            window.showWarningMessage("No Jira key available.");
            return;
        }

        await env.clipboard.writeText(jiraKey);
        window.showInformationMessage("Jira key copied to clipboard.");
    }

    private async runAddJiraKeyToPrTitle(item: GitHelperTreeItem | string | undefined): Promise<void> {
        const repoRoot =
            typeof item === "string"
                ? item
                : item?.repoRoot ?? (await getActiveRepository())?.rootUri.fsPath;
        if (!repoRoot) {
            window.showWarningMessage("No active git repository. Select one in Source Control.");
            return;
        }

        const repository = getRepositoryByRoot(repoRoot) ?? (await getActiveRepository());
        const branch = repository?.state.HEAD?.name;
        if (!branch) {
            window.showWarningMessage("No named branch checked out.");
            return;
        }

        const pr = await getPrInfo(repoRoot, branch);
        if (!pr) {
            window.showWarningMessage("No pull request found for the current branch.");
            return;
        }

        const jiraWorkspace = await getJiraWorkspace();
        if (!jiraWorkspace) {
            window.showWarningMessage("No synced Jira board found. Run jira sync first.");
            return;
        }

        const nextTitle = await pickJiraTicketPrTitle(jiraWorkspace.board, pr.title);
        if (!nextTitle || nextTitle === pr.title) {
            return;
        }

        const result = await runGh(repoRoot, ["pr", "edit", String(pr.number), "--title", nextTitle]);
        if (!result || result.status !== 0) {
            window.showWarningMessage("Could not update the pull request title.");
            await env.openExternal(Uri.parse(pr.url));
            return;
        }

        this.refresh();
    }

    private async runOpenFailedJobLog(item: GitHelperTreeItem | string | undefined): Promise<void> {
        const repoRoot =
            typeof item === "string"
                ? item
                : item?.repoRoot ?? (await getActiveRepository())?.rootUri.fsPath;
        if (!repoRoot) {
            window.showWarningMessage("No active git repository. Select one in Source Control.");
            return;
        }

        let logUrl = typeof item !== "string" ? item?.logUrl : undefined;
        if (!logUrl) {
            const repository = getRepositoryByRoot(repoRoot) ?? (await getActiveRepository());
            const branch = repository?.state.HEAD?.name;
            if (!branch) {
                window.showWarningMessage("No named branch checked out.");
                return;
            }

            const pr = await getPrInfo(repoRoot, branch);
            if (!pr) {
                window.showWarningMessage("No pull request found for the current branch.");
                return;
            }

            logUrl = (await getFailedPrCheck(repoRoot, pr.headRefOid))?.logUrl;
        }

        if (!logUrl) {
            window.showWarningMessage("No failed check log available.");
            return;
        }

        await env.openExternal(Uri.parse(logUrl));
    }

    private async runCopyPrUrl(item: GitHelperTreeItem | string | undefined): Promise<void> {
        const repoRoot =
            typeof item === "string"
                ? item
                : item?.repoRoot ?? (await getActiveRepository())?.rootUri.fsPath;
        if (!repoRoot) {
            window.showWarningMessage("No active git repository. Select one in Source Control.");
            return;
        }

        let url = typeof item !== "string" ? item?.prUrl : undefined;
        if (!url) {
            const repository = getRepositoryByRoot(repoRoot) ?? (await getActiveRepository());
            const branch = repository?.state.HEAD?.name;
            if (!branch) {
                window.showWarningMessage("No named branch checked out.");
                return;
            }
            url = (await getPrInfo(repoRoot, branch))?.url;
        }

        if (!url) {
            window.showWarningMessage("No pull request URL available.");
            return;
        }

        await env.clipboard.writeText(url);
        window.showInformationMessage("PR URL copied to clipboard.");
    }

    private async runMarkPrReady(item: GitHelperTreeItem | string | undefined): Promise<void> {
        const repoRoot =
            typeof item === "string"
                ? item
                : item?.repoRoot ?? (await getActiveRepository())?.rootUri.fsPath;
        if (!repoRoot) {
            window.showWarningMessage("No active git repository. Select one in Source Control.");
            return;
        }

        if (this.markingPrReadyFor === repoRoot) {
            return;
        }

        const repository = getRepositoryByRoot(repoRoot) ?? (await getActiveRepository());
        const branch = repository?.state.HEAD?.name;
        if (!repository || !branch) {
            window.showWarningMessage("No named branch checked out.");
            return;
        }

        this.markingPrReadyFor = repoRoot;
        this.changeEvent.fire(null);
        try {
            const pr = await markPullRequestReady(repoRoot, branch);
            if (!pr) {
                return;
            }

            this.refresh();
        } finally {
            if (this.markingPrReadyFor === repoRoot) {
                this.markingPrReadyFor = undefined;
                this.changeEvent.fire(null);
            }
        }
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
        if (element.action === "createDraftPr" && element.repoRoot === this.creatingDraftPrFor) {
            const item = new GitHelperTreeItem(
                element.kind,
                element.repoRoot,
                "Creating draft PR…",
                element.collapsibleState ?? TreeItemCollapsibleState.None,
                element.id ?? `${element.repoRoot}:createDraftPr`,
                element.action
            );
            item.contextValue = "action-createDraftPr-loading";
            item.iconPath = new ThemeIcon("sync~spin");
            return item;
        }
        if (element.action === "openPr" && element.repoRoot === this.markingPrReadyFor) {
            const item = new GitHelperTreeItem(
                element.kind,
                element.repoRoot,
                element.label as string,
                element.collapsibleState ?? TreeItemCollapsibleState.None,
                element.id ?? `${element.repoRoot}:openPr`,
                element.action,
                element.description as string | undefined
            );
            item.contextValue = "action-openPr-markReady-loading";
            item.iconPath = new ThemeIcon("sync~spin");
            item.prUrl = element.prUrl;
            return item;
        }
        return element;
    }

    async getChildren(element?: GitHelperTreeItem): Promise<GitHelperTreeItem[]> {
        if (element) {
            return [];
        }

        if (this.cachedChildren.length > 0) {
            return this.cachedChildren;
        }

        const children = await this.buildChildren();
        this.cachedChildren = children;
        this.childrenSignatureValue = childrenSignature(children);
        return children;
    }

    private async buildChildren(): Promise<GitHelperTreeItem[]> {
        let api = getGitApi();
        if (!api) {
            api = await getGitApiAsync();
        }
        if (!api) {
            return [infoItem("info:git-unavailable", "Git extension unavailable")];
        }

        if (api.repositories.length === 0) {
            return [infoItem("info:no-repos", "No git repositories open")];
        }

        let repository = resolveActiveRepository(api);
        if (!repository) {
            const selected = api.repositories.filter((repo) => repo.ui.selected);
            if (selected.length >= 1) {
                repository = selected[0];
            } else if (this.lastRepoRoot) {
                repository = api.repositories.find((repo) => repo.rootUri.fsPath === this.lastRepoRoot);
            }
        }
        if (!repository) {
            if (this.cachedChildren.length > 0 && this.cachedChildren[0]?.kind === "action") {
                return this.cachedChildren;
            }
            return [infoItem("info:select-repo", "Select a repository in Source Control")];
        }

        this.lastRepoRoot = repository.rootUri.fsPath;

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

        if (head?.name) {
            if (pr) {
                const prItem = new GitHelperTreeItem(
                    "action",
                    repoRoot,
                    `PR #${pr.number}`,
                    TreeItemCollapsibleState.None,
                    `${repoRoot}:openPr:${pr.number}`,
                    "openPr",
                    prRowDescription(pr),
                    { command: Commands.OpenPR, title: "Open PR", arguments: [repoRoot] }
                );
                prItem.contextValue = pr.isDraft ? "action-openPr-draft" : "action-openPr";
                prItem.prUrl = pr.url;
                items.push(prItem);

                const jiraWorkspace = await getJiraWorkspace();
                if (jiraWorkspace) {
                    const resolvedKey = resolveJiraKey(pr.title, branch, jiraWorkspace.keyPattern);
                    if (resolvedKey) {
                        const titleFallback = summaryFromPrTitle(pr.title, resolvedKey.key);
                        const description = await resolveJiraSummary(
                            repoRoot,
                            resolvedKey.key,
                            jiraWorkspace.board,
                            titleFallback
                        );
                        const jiraItem = new GitHelperTreeItem(
                            "action",
                            repoRoot,
                            resolvedKey.key,
                            TreeItemCollapsibleState.None,
                            `${repoRoot}:openJira:${resolvedKey.key}`,
                            "openJira",
                            description,
                            {
                                command: Commands.OpenJiraTicket,
                                title: "Open Jira ticket",
                                arguments: [repoRoot],
                            }
                        );
                        jiraItem.contextValue = "action-openJira";
                        jiraItem.jiraUrl = getJiraBrowseUrl(jiraWorkspace.baseUrl, resolvedKey.key);
                        jiraItem.jiraKey = resolvedKey.key;
                        items.push(jiraItem);
                    } else {
                        items.push(
                            new GitHelperTreeItem(
                                "action",
                                repoRoot,
                                "Add Jira key to PR title",
                                TreeItemCollapsibleState.None,
                                `${repoRoot}:addJiraKeyToPrTitle:${pr.number}`,
                                "addJiraKeyToPrTitle",
                                "Pick a synced ticket",
                                {
                                    command: Commands.AddJiraKeyToPrTitle,
                                    title: "Add Jira key to PR title",
                                    arguments: [repoRoot],
                                }
                            )
                        );
                    }
                }

                const changesItem = new GitHelperTreeItem(
                    "action",
                    repoRoot,
                    formatPrFileChangeLabel(pr.changedFiles),
                    TreeItemCollapsibleState.None,
                    `${repoRoot}:openPrChanges:${pr.number}`,
                    "openPrChanges",
                    formatPrLineChangeDescription(pr.additions, pr.deletions),
                    {
                        command: Commands.OpenPrChanges,
                        title: "Open PR changes",
                        arguments: [repoRoot],
                    }
                );
                changesItem.changesUrl = getPrChangesUrl(pr.url);
                items.push(changesItem);

                const reviewStatus = await getPrReviewStatus(repoRoot, pr.number);
                if (reviewStatus) {
                    const reviewItem = new GitHelperTreeItem(
                        "action",
                        repoRoot,
                        reviewStatus.label,
                        TreeItemCollapsibleState.None,
                        `${repoRoot}:openPrReview:${pr.number}`,
                        "openPrReview",
                        reviewStatus.description,
                        {
                            command: Commands.OpenPrReview,
                            title: "Open PR review",
                            arguments: [repoRoot],
                        }
                    );
                    reviewItem.reviewUrl = reviewStatus.url;
                    items.push(reviewItem);
                }

                const failedCheck = await getFailedPrCheck(repoRoot, pr.headRefOid);
                if (failedCheck) {
                    const failedLogItem = new GitHelperTreeItem(
                        "action",
                        repoRoot,
                        "Open failed job log",
                        TreeItemCollapsibleState.None,
                        `${repoRoot}:openFailedJobLog:${pr.number}`,
                        "openFailedJobLog",
                        "Checks failing",
                        {
                            command: Commands.OpenFailedJobLog,
                            title: "Open failed job log",
                            arguments: [repoRoot],
                        }
                    );
                    failedLogItem.logUrl = failedCheck.logUrl;
                    items.push(failedLogItem);
                }
            } else {
                items.push(
                    new GitHelperTreeItem(
                        "action",
                        repoRoot,
                        "Create draft PR",
                        TreeItemCollapsibleState.None,
                        `${repoRoot}:createDraftPr`,
                        "createDraftPr",
                        undefined,
                        {
                            command: Commands.CreateDraftPR,
                            title: "Create draft PR",
                            arguments: [repoRoot],
                        }
                    )
                );
            }
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
        `${repoRoot}:${action}`,
        action,
        description,
        { command: commandId, title: label, arguments: [repoRoot] }
    );
}
