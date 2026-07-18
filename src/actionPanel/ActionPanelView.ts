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
    TreeView,
    window,
    workspace,
} from "vscode";
import { Commands, ViewContainers, Views } from "../constants";
import type { Repository } from "../git/gitApi";
import { getGitApi, getGitApiAsync } from "../git/getGitApi";
import { countUnpublishedNotes, loadReviewNotes } from "../git/reviewNotes";
import { getActiveRepository, resolveActiveRepository } from "../git/resolveActiveRepository";
import { resolveBaseBranch } from "../git/resolveBaseBranch";
import { registerCommandIB } from "../utils/vscode";
import { getConfiguredActionPanelActions } from "./getActionPanelActions";
import { registerActionPanelRefresh } from "./refresh";
import { runActionPanelItem } from "./runAction";
import type { ActionPanelAction, ActionPanelContext, ActionPanelWhen } from "./types";

export type ActionPanelItemKind = "info" | "action";

export class ActionPanelTreeItem extends TreeItem {
    constructor(
        public readonly kind: ActionPanelItemKind,
        public readonly context: ActionPanelContext | undefined,
        label: string,
        collapsibleState: TreeItemCollapsibleState,
        public readonly actionId?: string,
        description?: string,
        command?: Command
    ) {
        super(label, collapsibleState);
        this.description = description;
        this.command = command;
        this.contextValue = actionId ? `action-${actionId}` : kind;
        if (actionId) {
            const action = getConfiguredActionPanelActions().find((entry) => entry.id === actionId);
            if (action?.icon) {
                this.iconPath = new ThemeIcon(action.icon);
            }
        }
    }
}

function trackRepository(
    provider: ActionPanelViewProvider,
    context: ExtensionContext,
    repository: Repository
): void {
    context.subscriptions.push(repository.state.onDidChange(() => provider.refresh()));
    context.subscriptions.push(repository.ui.onDidChange(() => provider.refresh()));
}

function matchesWhen(
    when: ActionPanelWhen | undefined,
    options: { hasBaseBranch: boolean; hasUnpublishedNotes: boolean }
): boolean {
    switch (when ?? "always") {
        case "hasBaseBranch":
            return options.hasBaseBranch;
        case "hasUnpublishedNotes":
            return options.hasUnpublishedNotes;
        default:
            return true;
    }
}

export class ActionPanelViewProvider implements TreeDataProvider<ActionPanelTreeItem> {
    private changeEvent = new EventEmitter<ActionPanelTreeItem | undefined | null>();
    private context: ExtensionContext | undefined;
    private treeView: TreeView<ActionPanelTreeItem> | undefined;

    get onDidChangeTreeData(): Event<ActionPanelTreeItem | undefined | null> {
        return this.changeEvent.event;
    }

    refresh(): void {
        void this.updateViewTitle();
        this.changeEvent.fire(null);
    }

    static activate(context: ExtensionContext): ActionPanelViewProvider {
        const provider = new ActionPanelViewProvider();
        provider.context = context;

        provider.treeView = window.createTreeView(Views.IbUtilitiesActionPanel, {
            treeDataProvider: provider,
        });
        context.subscriptions.push(provider.treeView);

        void provider.updateViewTitle();
        registerActionPanelRefresh(() => provider.refresh());

        registerCommandIB(
            Commands.ShowActionPanel,
            async () => {
                const { commands: vscodeCommands } = await import("vscode");
                await vscodeCommands.executeCommand(`workbench.view.${ViewContainers.ActionPanel}`);
                await vscodeCommands.executeCommand(`${Views.IbUtilitiesActionPanel}.focus`);
            },
            context
        );
        registerCommandIB(
            Commands.RunActionPanelItem,
            (actionId: string, panelContext?: ActionPanelContext) => provider.runAction(actionId, panelContext),
            context
        );

        context.subscriptions.push(
            workspace.onDidChangeConfiguration((event) => {
                if (event.affectsConfiguration("ib-utilities.actionPanel.actions")) {
                    provider.refresh();
                }
            })
        );

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

        return provider;
    }

    private async resolvePanelContext(repoRoot?: string): Promise<ActionPanelContext | undefined> {
        const repository = (await getActiveRepository()) ?? undefined;
        const resolvedRepoRoot = repoRoot ?? repository?.rootUri.fsPath;
        if (!resolvedRepoRoot) {
            return undefined;
        }

        const branch = repository?.rootUri.fsPath === resolvedRepoRoot ? repository.state.HEAD?.name : undefined;
        let baseBranch: string | undefined;
        if (repository?.rootUri.fsPath === resolvedRepoRoot) {
            const base = await resolveBaseBranch(repository);
            baseBranch = base?.name;
        }

        return {
            repoRoot: resolvedRepoRoot,
            branch,
            baseBranch,
        };
    }

    private async runAction(actionId: string, panelContext?: ActionPanelContext): Promise<void> {
        const context = panelContext ?? (await this.resolvePanelContext());
        if (!context) {
            window.showWarningMessage("No active git repository. Select one in Source Control.");
            return;
        }
        await runActionPanelItem(actionId, context);
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
            this.treeView.title = "Actions";
            this.treeView.description = undefined;
            return;
        }

        if (api.repositories.length === 0) {
            this.treeView.title = "Actions";
            this.treeView.description = "No repositories open";
            return;
        }

        const repository = resolveActiveRepository(api);
        if (!repository) {
            this.treeView.title = "Actions";
            this.treeView.description = "Select a repository";
            return;
        }

        const repoRoot = repository.rootUri.fsPath;
        const head = repository.state.HEAD;
        const base = await resolveBaseBranch(repository);
        const notes = head?.name ? await loadReviewNotes(repoRoot, head.name) : undefined;
        const noteCount = notes ? countUnpublishedNotes(notes) : 0;

        this.treeView.title = path.basename(repoRoot);

        const detailParts: string[] = [];
        if (head?.name) {
            detailParts.push(head.name);
        }
        if (base) {
            detailParts.push(`→ ${base.name}`);
        }
        if (noteCount > 0) {
            detailParts.push(`${noteCount} note${noteCount === 1 ? "" : "s"}`);
        }
        this.treeView.description = detailParts.length > 0 ? detailParts.join(" · ") : undefined;
    }

    getTreeItem(element: ActionPanelTreeItem): ActionPanelTreeItem {
        return element;
    }

    async getChildren(element?: ActionPanelTreeItem): Promise<ActionPanelTreeItem[]> {
        if (element) {
            return [];
        }

        let api = getGitApi();
        if (!api) {
            api = await getGitApiAsync();
        }
        if (!api) {
            return [new ActionPanelTreeItem("info", undefined, "Git extension unavailable", TreeItemCollapsibleState.None)];
        }

        if (api.repositories.length === 0) {
            return [new ActionPanelTreeItem("info", undefined, "No git repositories open", TreeItemCollapsibleState.None)];
        }

        const repository = resolveActiveRepository(api);
        if (!repository) {
            return [
                new ActionPanelTreeItem(
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
        const notes = head?.name ? await loadReviewNotes(repoRoot, head.name) : undefined;
        const noteCount = notes ? countUnpublishedNotes(notes) : 0;
        const panelContext: ActionPanelContext = {
            repoRoot,
            branch: head?.name,
            baseBranch: base?.name,
        };

        const visibility = {
            hasBaseBranch: Boolean(head?.name && base),
            hasUnpublishedNotes: noteCount > 0 && Boolean(head?.name),
        };

        return getConfiguredActionPanelActions()
            .filter((action) => matchesWhen(action.when, visibility))
            .map((action) => actionItem(panelContext, action));
    }
}

function actionItem(panelContext: ActionPanelContext, action: ActionPanelAction): ActionPanelTreeItem {
    return new ActionPanelTreeItem(
        "action",
        panelContext,
        action.label,
        TreeItemCollapsibleState.None,
        action.id,
        undefined,
        {
            command: Commands.RunActionPanelItem,
            title: action.label,
            arguments: [action.id, panelContext],
        }
    );
}
