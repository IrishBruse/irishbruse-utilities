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
import { getGitApi, getGitApiAsync, getRepositoryByRoot } from "../git/getGitApi";
import { countUnpublishedNotes, loadReviewNotes } from "../git/reviewNotes";
import { getActiveReviewSession, isReviewActive } from "../git/reviewSession";
import { resolveBaseBranch } from "../git/resolveBaseBranch";
import { registerCommandIB } from "../utils/vscode";
import { openBranchDiff } from "../git/openBranchDiff";
import { abortBranchReview, startBranchReview } from "../git/reviewSession";
import { exportReviewSummary, publishReviewToPR } from "../git/publishReview";
import { excludeFromReview } from "../git/excludeFromReview";
import { promptAndAddReviewNote } from "../git/publishReview";
import { resolveRepositoryPath } from "../git/resolveRepositoryPath";

export type GitHelperAction =
    | "diffWithBase"
    | "startReview"
    | "abortReview"
    | "openStaged"
    | "publishReview"
    | "exportReview"
    | "addNote";

export type GitHelperItemKind = "info" | "repo" | "action";

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
        if (kind === "repo") {
            this.iconPath = new ThemeIcon("repo");
        } else if (action === "diffWithBase") {
            this.iconPath = new ThemeIcon("diff");
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

        const treeRegistration = context.subscriptions;
        treeRegistration.push(window.registerTreeDataProvider(Views.IbUtilitiesGitHelpers, provider));

        registerCommandIB(Commands.RefreshGitHelpers, () => provider.refresh(), context);
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
        registerCommandIB(Commands.StartBranchReview, (item) => provider.runAction(item, "startReview"), context);
        registerCommandIB(Commands.AbortBranchReview, (item) => provider.runAction(item, "abortReview"), context);
        registerCommandIB(Commands.OpenStagedReview, (item) => provider.runAction(item, "openStaged"), context);
        registerCommandIB(Commands.PublishReviewToPR, (item) => provider.runAction(item, "publishReview"), context);
        registerCommandIB(Commands.ExportReviewSummary, (item) => provider.runAction(item, "exportReview"), context);
        registerCommandIB(Commands.AddReviewNote, (item) => provider.runAction(item, "addNote"), context);
        registerCommandIB(Commands.ExcludeFromReview, () => excludeFromReview(), context);

        const api = getGitApi();
        if (api) {
            const refresh = () => provider.refresh();
            context.subscriptions.push(api.onDidChangeState(refresh));
            context.subscriptions.push(api.onDidOpenRepository(refresh));
            context.subscriptions.push(api.onDidCloseRepository(refresh));
            for (const repo of api.repositories) {
                context.subscriptions.push(repo.state.onDidChange(refresh));
            }
            api.onDidOpenRepository((e) => {
                context.subscriptions.push(e.repository.state.onDidChange(refresh));
            });
        }

        void restoreReviewSession(context);
        return provider;
    }

    private async runAction(item: GitHelperTreeItem | string | undefined, action: GitHelperAction): Promise<void> {
        const repoRoot = typeof item === "string" ? item : item?.repoRoot ?? (await resolveRepositoryPath());
        if (!repoRoot || !this.context) {
            return;
        }

        const repository = getRepositoryByRoot(repoRoot);
        const branch = repository?.state.HEAD?.name ?? "unknown";

        switch (action) {
            case "diffWithBase":
                await openBranchDiff(repoRoot);
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
        let api = getGitApi();
        if (!api) {
            api = await getGitApiAsync();
        }
        if (!api) {
            return [
                new GitHelperTreeItem(
                    "info",
                    undefined,
                    "Git extension unavailable",
                    TreeItemCollapsibleState.None
                ),
            ];
        }

        if (!element) {
            if (api.repositories.length === 0) {
                return [
                    new GitHelperTreeItem("info", undefined, "No git repositories open", TreeItemCollapsibleState.None),
                ];
            }
            return api.repositories.map((repo) => {
                const name = path.basename(repo.rootUri.fsPath);
                return new GitHelperTreeItem(
                    "repo",
                    repo.rootUri.fsPath,
                    name,
                    TreeItemCollapsibleState.Collapsed
                );
            });
        }

        if (element.kind !== "repo" || !element.repoRoot) {
            return [];
        }

        const repository = getRepositoryByRoot(element.repoRoot);
        if (!repository) {
            return [];
        }

        const head = repository.state.HEAD;
        const base = await resolveBaseBranch(repository);
        const inReview = isReviewActive(element.repoRoot);
        const notes = head?.name ? await loadReviewNotes(element.repoRoot, head.name) : { notes: [] };
        const noteCount = countUnpublishedNotes(notes as import("../git/reviewNotes").ReviewNotesFile);

        const descriptionParts: string[] = [];
        if (head?.name) {
            descriptionParts.push(head.name);
        }
        if (base) {
            descriptionParts.push(`→ ${base.name}`);
        }
        if (inReview) {
            descriptionParts.push("reviewing");
        }
        if (noteCount > 0) {
            descriptionParts.push(`${noteCount} note${noteCount === 1 ? "" : "s"}`);
        }
        element.description = descriptionParts.join(" · ");

        const items: GitHelperTreeItem[] = [
            actionItem(element.repoRoot, "Diff vs base", "diffWithBase", Commands.DiffWithBase),
        ];

        if (inReview) {
            items.push(
                actionItem(element.repoRoot, "Open staged review", "openStaged", Commands.OpenStagedReview),
                actionItem(element.repoRoot, "Add review note", "addNote", Commands.AddReviewNote),
                actionItem(element.repoRoot, "Publish notes to PR", "publishReview", Commands.PublishReviewToPR),
                actionItem(element.repoRoot, "Export review summary", "exportReview", Commands.ExportReviewSummary),
                actionItem(element.repoRoot, "Abort review", "abortReview", Commands.AbortBranchReview)
            );
        } else if (head?.name && base) {
            items.push(actionItem(element.repoRoot, "Start branch review", "startReview", Commands.StartBranchReview));
            if (noteCount > 0) {
                items.push(
                    actionItem(element.repoRoot, "Publish notes to PR", "publishReview", Commands.PublishReviewToPR),
                    actionItem(element.repoRoot, "Export review summary", "exportReview", Commands.ExportReviewSummary)
                );
            }
        }

        return items;
    }
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
