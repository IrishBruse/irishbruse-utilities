import path from "path";
import {
    Command,
    Event,
    EventEmitter,
    ExtensionContext,
    ThemeIcon,
    TreeDataProvider,
    TreeItem,
    TreeItemCollapsibleState,
    window,
} from "vscode";
import { Commands, Views } from "../constants";
import type { Repository } from "../git/gitApi";
import { getGitApi, getGitApiAsync } from "../git/getGitApi";
import { countUnpublishedNotes, loadReviewNotes } from "../git/reviewNotes";
import { getActiveReviewSession, isReviewActive } from "../git/reviewSession";
import { resolveActiveRepository } from "../git/resolveActiveRepository";
import { resolveBaseBranch } from "../git/resolveBaseBranch";
import { registerCommandIB } from "../utils/vscode";
import { openBranchDiff } from "../git/openBranchDiff";
import { abortBranchReview, startBranchReview } from "../git/reviewSession";
import { exportReviewSummary, publishReviewToPR } from "../git/publishReview";
import { excludeFromReview } from "../git/excludeFromReview";
import { promptAndAddReviewNote } from "../git/publishReview";
import { getActiveRepository } from "../git/resolveActiveRepository";
import { openPR } from "../commands/openPR";

export type GitHelperAction =
    | "diffWithBase"
    | "openPR"
    | "startReview"
    | "abortReview"
    | "openStaged"
    | "publishReview"
    | "exportReview"
    | "addNote";

export type GitHelperItemKind = "info" | "header" | "action";

export class GitHelperTreeItem extends TreeItem {
    constructor(
        public readonly kind: GitHelperItemKind,
        public readonly repoRoot: string | undefined,
        label: string,
        collapsibleState: TreeItemCollapsibleState,
        public readonly action?: GitHelperAction,
        description?: string,
        command?: Command
    ) {
        super(label, collapsibleState);
        this.description = description;
        this.command = command;
        this.contextValue = action ? `action-${action}` : kind;
        if (kind === "header") {
            this.iconPath = new ThemeIcon("repo");
        } else if (action === "diffWithBase") {
            this.iconPath = new ThemeIcon("diff");
        } else if (action === "openPR") {
            this.iconPath = new ThemeIcon("github");
        } else if (action === "startReview" || action === "openStaged") {
            this.iconPath = new ThemeIcon("eye");
        } else if (action === "abortReview") {
            this.iconPath = new ThemeIcon("discard");
        } else if (action === "publishReview" || action === "exportReview") {
            this.iconPath = new ThemeIcon("comment");
        } else if (action === "addNote") {
            this.iconPath = new ThemeIcon("note");
        }
    }
}

function trackRepository(
    provider: GitHelpersViewProvider,
    context: ExtensionContext,
    repository: Repository
): void {
    context.subscriptions.push(repository.state.onDidChange(() => provider.refresh()));
    context.subscriptions.push(repository.ui.onDidChange(() => provider.refresh()));
}

export class GitHelpersViewProvider implements TreeDataProvider<GitHelperTreeItem> {
    private changeEvent = new EventEmitter<GitHelperTreeItem | undefined | null>();
    private context: ExtensionContext | undefined;

    get onDidChangeTreeData(): Event<GitHelperTreeItem | undefined | null> {
        return this.changeEvent.event;
    }

    refresh(): void {
        this.changeEvent.fire(null);
    }

    static activate(context: ExtensionContext): GitHelpersViewProvider {
        const provider = new GitHelpersViewProvider();
        provider.context = context;

        context.subscriptions.push(window.registerTreeDataProvider(Views.IbUtilitiesGitHelpers, provider));

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
        registerCommandIB(Commands.OpenPR, (repoPath) => provider.runAction(repoPath, "openPR"), context);
        registerCommandIB(Commands.StartBranchReview, (item) => provider.runAction(item, "startReview"), context);
        registerCommandIB(Commands.AbortBranchReview, (item) => provider.runAction(item, "abortReview"), context);
        registerCommandIB(Commands.OpenStagedReview, (item) => provider.runAction(item, "openStaged"), context);
        registerCommandIB(Commands.PublishReviewToPR, (item) => provider.runAction(item, "publishReview"), context);
        registerCommandIB(Commands.ExportReviewSummary, (item) => provider.runAction(item, "exportReview"), context);
        registerCommandIB(Commands.AddReviewNote, (item) => provider.runAction(item, "addNote"), context);
        registerCommandIB(Commands.ExcludeFromReview, () => excludeFromReview(), context);

        const wireApi = (api: NonNullable<ReturnType<typeof getGitApi>>) => {
            const refresh = () => provider.refresh();
            context.subscriptions.push(api.onDidChangeState(refresh));
            context.subscriptions.push(api.onDidOpenRepository((e) => trackRepository(provider, context, e.repository)));
            context.subscriptions.push(api.onDidCloseRepository(refresh));
            for (const repo of api.repositories) {
                trackRepository(provider, context, repo);
            }
        };

        const api = getGitApi();
        if (api) {
            wireApi(api);
        } else {
            void getGitApiAsync().then((loaded) => {
                if (loaded) {
                    wireApi(loaded);
                    provider.refresh();
                }
            });
        }

        context.subscriptions.push(window.onDidChangeActiveTextEditor(() => provider.refresh()));

        void restoreReviewSession(context);
        return provider;
    }

    private async runAction(item: GitHelperTreeItem | string | undefined, action: GitHelperAction): Promise<void> {
        const repoRoot =
            typeof item === "string"
                ? item
                : item?.repoRoot ?? (await getActiveRepository())?.rootUri.fsPath;
        if (!repoRoot || !this.context) {
            window.showWarningMessage("No active git repository. Select one in Source Control.");
            return;
        }

        const repository = (await getActiveRepository()) ?? undefined;
        const branch = repository?.state.HEAD?.name ?? "unknown";

        switch (action) {
            case "diffWithBase":
                await openBranchDiff(repoRoot);
                break;
            case "openPR":
                await openPR(undefined, repoRoot);
                break;
            case "startReview":
                await startBranchReview(this.context, repoRoot);
                this.refresh();
                break;
            case "abortReview":
                await abortBranchReview(this.context, repoRoot);
                this.refresh();
                break;
            case "openStaged":
                await import("../git/reviewSession").then((m) => m.openStagedReview(repoRoot));
                break;
            case "publishReview":
                await publishReviewToPR(repoRoot, branch);
                this.refresh();
                break;
            case "exportReview":
                await exportReviewSummary(repoRoot, branch);
                break;
            case "addNote":
                await promptAndAddReviewNote(repoRoot);
                this.refresh();
                break;
        }
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
            return [
                new GitHelperTreeItem("info", undefined, "Git extension unavailable", TreeItemCollapsibleState.None),
            ];
        }

        if (api.repositories.length === 0) {
            return [
                new GitHelperTreeItem("info", undefined, "No git repositories open", TreeItemCollapsibleState.None),
            ];
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
        const base = await resolveBaseBranch(repository);
        const inReview = isReviewActive(repoRoot);
        const notes = head?.name ? await loadReviewNotes(repoRoot, head.name) : undefined;
        const noteCount = notes ? countUnpublishedNotes(notes) : 0;

        const headerParts: string[] = [];
        if (head?.name) {
            headerParts.push(head.name);
        }
        if (base) {
            headerParts.push(`→ ${base.name}`);
        }
        if (inReview) {
            headerParts.push("reviewing");
        }
        if (noteCount > 0) {
            headerParts.push(`${noteCount} note${noteCount === 1 ? "" : "s"}`);
        }

        const items: GitHelperTreeItem[] = [
            headerItem(repoRoot, path.basename(repoRoot), headerParts.join(" · ")),
        ];

        if (inReview) {
            items.push(
                actionItem(repoRoot, "Staged review", "openStaged", Commands.OpenStagedReview),
                actionItem(repoRoot, "Add note", "addNote", Commands.AddReviewNote),
                actionItem(repoRoot, "Publish notes", "publishReview", Commands.PublishReviewToPR),
                actionItem(repoRoot, "Export summary", "exportReview", Commands.ExportReviewSummary),
                actionItem(repoRoot, "Abort review", "abortReview", Commands.AbortBranchReview)
            );
        } else {
            if (head?.name && base) {
                items.push(actionItem(repoRoot, "Start branch review", "startReview", Commands.StartBranchReview));
            }
            if (noteCount > 0) {
                items.push(
                    actionItem(repoRoot, "Publish notes", "publishReview", Commands.PublishReviewToPR),
                    actionItem(repoRoot, "Export summary", "exportReview", Commands.ExportReviewSummary)
                );
            }
        }

        return items;
    }
}

function headerItem(repoRoot: string, label: string, tooltipDetail: string): GitHelperTreeItem {
    const item = new GitHelperTreeItem(
        "header",
        repoRoot,
        label,
        TreeItemCollapsibleState.None,
        undefined,
        undefined
    );
    item.tooltip = tooltipDetail ? `${label}\n${tooltipDetail}` : label;
    return item;
}

function actionItem(
    repoRoot: string,
    label: string,
    action: GitHelperAction,
    commandId: Commands
): GitHelperTreeItem {
    return new GitHelperTreeItem(
        "action",
        repoRoot,
        label,
        TreeItemCollapsibleState.None,
        action,
        undefined,
        { command: commandId, title: label, arguments: [repoRoot] }
    );
}

async function restoreReviewSession(context: ExtensionContext): Promise<void> {
    const { restoreReviewSession: restore } = await import("../git/reviewSession");
    await restore(context);
}
