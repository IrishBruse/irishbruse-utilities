import path from "path";
import os from "os";
import {
    commands,
    env,
    Event,
    EventEmitter,
    ExtensionContext,
    SourceControl,
    ThemeIcon,
    TreeDataProvider,
    TreeItemCollapsibleState,
    TreeView,
    Uri,
    window,
    workspace,
} from "vscode";
import { Commands, Views } from "../constants";
import { getGitApi, getGitApiAsync, getRepositoryByRoot } from "../lib/git/getGitApi";
import { clearLegacyBranchReviewState } from "../lib/git/clearLegacyReviewState";
import { createBlankDraftPullRequest } from "../lib/git/createDraftPR";
import type { Repository } from "../lib/git/gitApi";
import { getActiveRepository, resolveActiveRepository } from "../lib/git/resolveActiveRepository";
import { registerBaseBranchOverrideStorage } from "../lib/git/baseBranchOverride";
import { pickBaseBranchTarget } from "../lib/git/pickBaseBranch";
import { isMainlineBranch, isSameBranch, resolveBaseBranch } from "../lib/git/resolveBaseBranch";
import { wireGitRepositories } from "../lib/git/wireGitRepositories";
import { markPullRequestReady } from "../lib/git/markPrReady";
import { openPR } from "../commands/openPR";
import { openRepo } from "../commands/openRepo";
import {
    formatPrFileChangeLabel,
    formatPrLineChangeDescription,
    getPrInfo,
    runGh,
} from "../lib/git/githubUrl";
import { openBranchDiff } from "../lib/git/openBranchDiff";
import { getPrCheckStatus } from "../lib/git/prChecks";
import { getPrReviewStatus } from "../lib/git/prReviewStatus";
import { getJiraBrowseUrl, getJiraKeyPattern, getJiraWorkspace } from "../jira/jiraWorkspace";
import { extractJiraKeyFromTitle, resolveJiraKey, summaryFromPrTitle } from "../jira/jiraKey";
import { pickJiraTicketPrTitle } from "../jira/pickJiraTicketForPrTitle";
import { registerCommandIB } from "../lib/vscode/vscode";
import { checksTreeItem } from "./checksTreeItem";
import { GitHelperTreeItem } from "./GitHelperTreeItem";
import { loadBranchChanges, type BranchChangesSummary } from "./loadBranchChanges";
import {
    isGitHelpersDebugMode,
    showGitHelpersDebugAction,
    syncGitHelpersDebugModeContext,
} from "./debugMode";
import { buildMockGitHelpersChildren, getGitHelpersMockState, MOCK_REPO_ROOT } from "./mockData";
import { registerGitHelpersRefresh } from "../lib/git/refresh";
import {
    GIT_HELPER_DATA_FRESH_MS,
    GIT_HELPERS_REFRESHING_CONTEXT,
    planGitHelperRefresh,
    refreshVisualHoldMs,
} from "./cacheRefresh";
import { PanelDataCache } from "./panelDataCache";
import { RepoChildrenCache, type RepoChildrenCacheEntry } from "./repoChildrenCache";

export { GitHelperTreeItem } from "./GitHelperTreeItem";
export type { GitHelperItemKind } from "./GitHelperTreeItem";

const JIRA_SYNCED_CONTEXT = "ib-utilities.jira.synced";

function prRowDescription(
    pr: { title: string },
    jiraKeyPattern?: RegExp,
    resolvedKey?: string
): string {
    const keyFromTitle = jiraKeyPattern ? extractJiraKeyFromTitle(pr.title, jiraKeyPattern) : undefined;
    const key = keyFromTitle ?? resolvedKey;
    if (key) {
        return summaryFromPrTitle(pr.title, key) ?? pr.title;
    }
    return pr.title;
}

function prContextValue(isDraft: boolean, hasJira: boolean, jiraSynced: boolean): string {
    if (isDraft) {
        if (hasJira) {
            return "action-openPr-draft-hasJira";
        }
        return jiraSynced ? "action-openPr-draft-noJira" : "action-openPr-draft";
    }
    if (hasJira) {
        return "action-openPr-hasJira";
    }
    return jiraSynced ? "action-openPr-noJira" : "action-openPr";
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

function guardGitHelpersDebugAction(message: string): boolean {
    if (!isGitHelpersDebugMode()) {
        return false;
    }
    showGitHelpersDebugAction(message);
    return true;
}

export class GitHelpersViewProvider implements TreeDataProvider<GitHelperTreeItem> {
    private changeEvent = new EventEmitter<GitHelperTreeItem | undefined | null>();
    private treeView: TreeView<GitHelperTreeItem> | undefined;
    private cachedChildren: GitHelperTreeItem[] = [];
    private childrenSignatureValue = "";
    private repoChildrenCache = new RepoChildrenCache<GitHelperTreeItem>();
    private panelDataCache = new PanelDataCache(GIT_HELPER_DATA_FRESH_MS, () => Date.now());
    private displayedRepoRoot: string | undefined;
    private lastRepoRoot: string | undefined;
    private refreshTimer: ReturnType<typeof setTimeout> | undefined;
    private buildGeneration = 0;
    private creatingDraftPrFor: string | undefined;
    private markingPrReadyFor: string | undefined;
    private cachedChecksUrl: string | undefined;
    private refreshVisualToken = 0;
    private refreshVisualStartedAt = 0;
    private refreshVisualVisible = false;

    get onDidChangeTreeData(): Event<GitHelperTreeItem | undefined | null> {
        return this.changeEvent.event;
    }

    refresh(force = false): void {
        if (force) {
            this.panelDataCache.clear();
        }
        const activeRoot = this.getActiveRepoRootSync();
        const cached = activeRoot ? this.repoChildrenCache.get(activeRoot) : undefined;
        if (activeRoot && cached && planGitHelperRefresh(true) === "background") {
            if (this.displayedRepoRoot !== activeRoot) {
                this.showCached(activeRoot, cached);
            }
            this.startRefreshVisual();
        } else if (this.shouldShowLoading(activeRoot)) {
            this.enterLoadingState();
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

    private shouldShowLoading(activeRoot: string | undefined): boolean {
        if (this.cachedChildren.some((item) => item.id === "info:loading")) {
            return false;
        }
        if (this.cachedChildren.length > 0 && (!activeRoot || !this.displayedRepoRoot || this.displayedRepoRoot === activeRoot)) {
            return false;
        }
        return planGitHelperRefresh(false) === "loading";
    }

    private getActiveRepoRootSync(): string | undefined {
        const api = getGitApi();
        if (!api) {
            return undefined;
        }
        return resolveActiveRepository(api)?.rootUri.fsPath;
    }

    private restoreCachedOrLoading(repoRoot: string): void {
        const cached = this.repoChildrenCache.get(repoRoot);
        if (cached && planGitHelperRefresh(true) === "background") {
            this.showCached(repoRoot, cached);
            this.startRefreshVisual();
            return;
        }
        this.enterLoadingState();
    }

    private showCached(repoRoot: string, cached: RepoChildrenCacheEntry<GitHelperTreeItem>): void {
        ++this.buildGeneration;
        this.cachedChildren = cached.children;
        this.childrenSignatureValue = cached.signature;
        this.cachedChecksUrl = cached.checksUrl;
        this.displayedRepoRoot = repoRoot;
        this.changeEvent.fire(null);
    }

    private startRefreshVisual(): void {
        ++this.refreshVisualToken;
        this.refreshVisualStartedAt = Date.now();
        this.refreshVisualVisible = true;
        void commands.executeCommand("setContext", GIT_HELPERS_REFRESHING_CONTEXT, true);
        this.showRefreshDescription();
    }

    private async finishRefreshVisual(token: number): Promise<void> {
        const hold = refreshVisualHoldMs(this.refreshVisualStartedAt, Date.now());
        if (hold > 0) {
            await delay(hold);
        }
        if (token !== this.refreshVisualToken) {
            return;
        }
        this.refreshVisualVisible = false;
        await commands.executeCommand("setContext", GIT_HELPERS_REFRESHING_CONTEXT, false);
        this.hideRefreshDescription();
    }

    private showRefreshDescription(): void {
        if (!this.treeView) {
            return;
        }
        if (this.treeView.description && this.treeView.description !== "Updating…") {
            return;
        }
        this.treeView.description = "Updating…";
    }

    private hideRefreshDescription(): void {
        if (!this.treeView || this.treeView.description !== "Updating…") {
            return;
        }
        this.treeView.description = undefined;
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
        const repoRoot = children.find((item) => item.repoRoot)?.repoRoot;
        if (signature === this.childrenSignatureValue) {
            if (repoRoot) {
                this.repoChildrenCache.set(repoRoot, children, signature, this.cachedChecksUrl);
            }
            return;
        }
        this.cachedChildren = children;
        this.childrenSignatureValue = signature;
        if (repoRoot) {
            this.displayedRepoRoot = repoRoot;
            this.repoChildrenCache.set(repoRoot, children, signature, this.cachedChecksUrl);
        }
        this.changeEvent.fire(null);
    }

    private async rebuildChildren(): Promise<void> {
        const generation = ++this.buildGeneration;
        const visualToken = this.refreshVisualToken;
        try {
            const children = await this.buildChildren();
            if (generation !== this.buildGeneration) {
                return;
            }
            this.applyChildren(children);
        } finally {
            if (generation === this.buildGeneration && visualToken !== 0) {
                void this.finishRefreshVisual(visualToken);
            }
        }
    }

    static activate(context: ExtensionContext): GitHelpersViewProvider {
        const provider = new GitHelpersViewProvider();

        provider.treeView = window.createTreeView(Views.IbUtilitiesGitHelpers, {
            treeDataProvider: provider,
        });
        context.subscriptions.push(provider.treeView);

        void clearLegacyBranchReviewState(context);
        registerBaseBranchOverrideStorage(context);
        void syncGitHelpersDebugModeContext();
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
        registerCommandIB(Commands.DiffWithBase, (item) => provider.runDiffWithBase(item), context);
        registerCommandIB(Commands.SetBaseBranch, (item?: GitHelperTreeItem) => pickBaseBranchTarget(item?.repoRoot), context);
        registerCommandIB(Commands.OpenPR, (item) => provider.runOpenPr(item), context);
        registerCommandIB(Commands.OpenRepo, (repoPath) => provider.runOpenRepo(repoPath), context);
        registerCommandIB(Commands.RefreshGitHelpers, () => provider.refresh(true), context);
        registerCommandIB(Commands.GitHelpersRefreshing, () => provider.refresh(true), context);
        registerCommandIB(Commands.CreateDraftPR, (item) => provider.runCreateDraftPr(item), context);
        registerCommandIB(Commands.MarkPrReady, (item) => provider.runMarkPrReady(item), context);
        registerCommandIB(Commands.CopyPrUrl, (item) => provider.runCopyPrUrl(item), context);
        registerCommandIB(Commands.OpenPrReview, (item) => provider.runOpenPrReview(item), context);
        registerCommandIB(Commands.OpenPrChecks, (item) => provider.runOpenPrChecks(item), context);
        registerCommandIB(Commands.OpenJiraTicket, (item) => provider.runOpenJiraTicket(item), context);
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
                if (event.affectsConfiguration("ib-utilities.gitHelpers.debugMode")) {
                    void syncGitHelpersDebugModeContext();
                    provider.refresh(true);
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

    private async runOpenRepo(repoPath?: string | SourceControl): Promise<void> {
        if (guardGitHelpersDebugAction("Open repository (mock: IrishBruse/irishbruse-utilities)")) {
            return;
        }

        const repoRoot =
            typeof repoPath === "string"
                ? repoPath
                : repoPath?.rootUri?.fsPath ?? (await getActiveRepository())?.rootUri.fsPath;
        if (!repoRoot) {
            window.showWarningMessage("No active git repository. Select one in Source Control.");
            return;
        }
        const sourceControl = repoPath && typeof repoPath !== "string" ? repoPath : undefined;
        await openRepo(sourceControl, repoRoot);
    }

    private async runOpenPr(item?: GitHelperTreeItem | string | SourceControl): Promise<void> {
        if (guardGitHelpersDebugAction("Open PR #42 (draft)")) {
            return;
        }

        if (item && typeof item === "object" && "prUrl" in item) {
            if (item.prUrl) {
                await env.openExternal(Uri.parse(item.prUrl));
                return;
            }
            if (item.repoRoot) {
                await openPR(undefined, item.repoRoot);
                return;
            }
        }

        const repoRoot =
            typeof item === "string"
                ? item
                : item && typeof item !== "string" && "rootUri" in item
                  ? item.rootUri?.fsPath
                  : (await getActiveRepository())?.rootUri.fsPath;
        if (!repoRoot) {
            window.showWarningMessage("No active git repository. Select one in Source Control.");
            return;
        }
        const sourceControl = item && typeof item !== "string" && "rootUri" in item ? item : undefined;
        await openPR(sourceControl, repoRoot);
    }

    private async runDiffWithBase(item?: GitHelperTreeItem | string): Promise<void> {
        const repoRoot =
            typeof item === "string"
                ? item
                : item?.repoRoot ?? (await getActiveRepository())?.rootUri.fsPath;
        if (!repoRoot) {
            window.showWarningMessage("No active git repository. Select one in Source Control.");
            return;
        }
        if (isGitHelpersDebugMode() && repoRoot === MOCK_REPO_ROOT) {
            showGitHelpersDebugAction("Diff vs main (mock)");
            return;
        }
        await openBranchDiff(repoRoot);
    }

    private async runCreateDraftPr(item: GitHelperTreeItem | string | undefined): Promise<void> {
        if (guardGitHelpersDebugAction("Create draft PR")) {
            return;
        }

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

            this.refresh(true);
            await env.openExternal(Uri.parse(pr.url));
        } finally {
            if (this.creatingDraftPrFor === repoRoot) {
                this.creatingDraftPrFor = undefined;
                this.changeEvent.fire(null);
            }
        }
    }

    private async runOpenPrReview(item: GitHelperTreeItem | string | undefined): Promise<void> {
        if (guardGitHelpersDebugAction("Open PR review (2 unresolved threads)")) {
            return;
        }

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

    private async runOpenJiraTicket(item: GitHelperTreeItem | string | undefined): Promise<void> {
        if (guardGitHelpersDebugAction("Open Jira ticket PROJ-123")) {
            return;
        }

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

    private async runAddJiraKeyToPrTitle(item: GitHelperTreeItem | string | undefined): Promise<void> {
        if (guardGitHelpersDebugAction("Add Jira key to PR title")) {
            return;
        }

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

        this.refresh(true);
    }

    private async runOpenPrChecks(item: GitHelperTreeItem | string | undefined): Promise<void> {
        if (guardGitHelpersDebugAction("Open PR checks (ci / build failing)")) {
            return;
        }

        const repoRoot =
            typeof item === "string"
                ? item
                : item?.repoRoot ?? (await getActiveRepository())?.rootUri.fsPath;
        if (!repoRoot) {
            window.showWarningMessage("No active git repository. Select one in Source Control.");
            return;
        }

        let checksUrl = typeof item !== "string" ? item?.checksUrl : undefined;
        if (!checksUrl && repoRoot === this.displayedRepoRoot) {
            checksUrl = this.cachedChecksUrl;
        }
        if (!checksUrl) {
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

            checksUrl = (await getPrCheckStatus(repoRoot, pr.headRefOid, pr.url))?.url;
        }

        if (!checksUrl) {
            window.showWarningMessage("No PR checks available.");
            return;
        }

        await env.openExternal(Uri.parse(checksUrl));
    }

    private async runCopyPrUrl(item: GitHelperTreeItem | string | undefined): Promise<void> {
        if (isGitHelpersDebugMode()) {
            await env.clipboard.writeText(getGitHelpersMockState().pr.url);
            window.showInformationMessage("PR URL copied to clipboard.");
            return;
        }

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
        if (guardGitHelpersDebugAction("Mark PR ready for review")) {
            return;
        }

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

            this.refresh(true);
        } finally {
            if (this.markingPrReadyFor === repoRoot) {
                this.markingPrReadyFor = undefined;
                this.changeEvent.fire(null);
            }
        }
    }

    private async updateViewTitle(): Promise<void> {
        if (!this.treeView) {
            return;
        }

        if (isGitHelpersDebugMode()) {
            const mock = getGitHelpersMockState();
            this.treeView.title = mock.repoName;
            this.treeView.description = undefined;
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
        this.treeView.description = this.refreshVisualVisible ? "Updating…" : undefined;
    }

    private async syncViewContexts(jiraSynced: boolean): Promise<void> {
        await commands.executeCommand("setContext", JIRA_SYNCED_CONTEXT, jiraSynced);
    }

    private applyCheckStatus(checkStatus: { url: string } | undefined): void {
        this.cachedChecksUrl = checkStatus?.url;
    }

    private loadCachedPrInfo(repoRoot: string, branch: string) {
        return this.panelDataCache.load(`pr:${repoRoot}:${branch}`, () => getPrInfo(repoRoot, branch));
    }

    private loadCachedCheckStatus(repoRoot: string, headRefOid: string, prUrl: string) {
        return this.panelDataCache.load(`checks:${repoRoot}:${headRefOid}`, () =>
            getPrCheckStatus(repoRoot, headRefOid, prUrl)
        );
    }

    private loadCachedReviewStatus(repoRoot: string, prNumber: number) {
        return this.panelDataCache.load(`review:${repoRoot}:${prNumber}`, () => getPrReviewStatus(repoRoot, prNumber));
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
            item.contextValue = element.contextValue ?? "action-openPr-markReady-loading";
            item.iconPath = new ThemeIcon("sync~spin");
            item.prUrl = element.prUrl;
            item.jiraUrl = element.jiraUrl;
            item.jiraKey = element.jiraKey;
            return item;
        }
        if (element.action === "openPr") {
            const item = element;
            item.iconPath = new ThemeIcon(element.isDraftPr ? "git-pull-request-draft" : "git-pull-request");
            return item;
        }
        if (element.action === "openPrChecks") {
            const item = element;
            item.iconPath = new ThemeIcon(element.contextValue === "action-openPrChecks-failing" ? "error" : "run-all");
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

        this.scheduleChildrenRefresh();
        const loading = [loadingItem()];
        this.cachedChildren = loading;
        this.childrenSignatureValue = childrenSignature(loading);
        return loading;
    }

    private async buildMockChildren(): Promise<GitHelperTreeItem[]> {
        const mock = getGitHelpersMockState();
        const items = buildMockGitHelpersChildren(mock);
        this.applyCheckStatus(mock.checkStatus);
        await this.syncViewContexts(true);
        await this.updateViewTitle();
        this.displayedRepoRoot = mock.repoRoot;
        return items;
    }

    private async buildChildren(): Promise<GitHelperTreeItem[]> {
        if (isGitHelpersDebugMode()) {
            return this.buildMockChildren();
        }

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
        const [base, pr, jiraWorkspace] = await Promise.all([
            resolveBaseBranch(repository),
            branch ? this.loadCachedPrInfo(repoRoot, branch) : Promise.resolve(undefined),
            getJiraWorkspace(),
        ]);

        const items: GitHelperTreeItem[] = [];
        const jiraKeyPattern = getJiraKeyPattern();
        const jiraSynced = Boolean(jiraWorkspace);

        if (head?.name) {
            if (pr) {
                const resolvedKey = jiraKeyPattern
                    ? resolveJiraKey(pr.title, branch, jiraKeyPattern)
                    : undefined;
                const prItem = new GitHelperTreeItem(
                    "action",
                    repoRoot,
                    `PR #${pr.number}`,
                    TreeItemCollapsibleState.None,
                    `${repoRoot}:openPr:${pr.number}`,
                    "openPr",
                    prRowDescription(pr, jiraKeyPattern, resolvedKey?.key)
                );
                prItem.isDraftPr = pr.isDraft;
                prItem.contextValue = prContextValue(pr.isDraft, Boolean(resolvedKey), jiraSynced);
                prItem.prUrl = pr.url;
                prItem.command = { command: Commands.OpenPR, title: "Open PR", arguments: [prItem] };
                if (resolvedKey && jiraWorkspace) {
                    prItem.jiraUrl = getJiraBrowseUrl(jiraWorkspace.baseUrl, resolvedKey.key);
                    prItem.jiraKey = resolvedKey.key;
                }
                items.push(prItem);

                const [diffItems, checkStatus, reviewStatus] = await Promise.all([
                    base ? diffAndChangesItems(repoRoot, base.name) : Promise.resolve([]),
                    this.loadCachedCheckStatus(repoRoot, pr.headRefOid, pr.url),
                    this.loadCachedReviewStatus(repoRoot, pr.number),
                ]);
                items.push(...diffItems);
                this.applyCheckStatus(checkStatus);
                if (checkStatus) {
                    items.push(checksTreeItem(repoRoot, pr.number, checkStatus));
                }

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
            } else {
                this.applyCheckStatus(undefined);
                if (!isMainlineBranch(head.name) && (!base || !isSameBranch(head.name, base.name))) {
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
                    if (base) {
                        items.push(...(await diffAndChangesItems(repoRoot, base.name)));
                    }
                }
            }
        } else {
            this.applyCheckStatus(undefined);
        }

        await Promise.all([this.syncViewContexts(jiraSynced), this.updateViewTitle()]);

        return items;
    }
}

async function diffAndChangesItems(repoRoot: string, baseName: string): Promise<GitHelperTreeItem[]> {
    const items: GitHelperTreeItem[] = [
        actionItem(repoRoot, "Diff", "diffWithBase", Commands.DiffWithBase, baseName),
    ];
    const changesData = await loadBranchChanges(repoRoot);
    if (changesData) {
        items.push(changesItem(repoRoot, changesData));
    }
    return items;
}

function changesItem(repoRoot: string, summary: BranchChangesSummary): GitHelperTreeItem {
    return new GitHelperTreeItem(
        "action",
        repoRoot,
        formatPrFileChangeLabel(summary.changedFiles),
        TreeItemCollapsibleState.None,
        `${repoRoot}:showChanges`,
        "showChanges",
        formatPrLineChangeDescription(summary.additions, summary.deletions),
        { command: Commands.DiffWithBase, title: "Diff", arguments: [repoRoot] }
    );
}

function delay(ms: number): Promise<void> {
    return new Promise((resolve) => {
        setTimeout(resolve, ms);
    });
}

function actionItem(
    repoRoot: string,
    label: string,
    action: "diffWithBase",
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
