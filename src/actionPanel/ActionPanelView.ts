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
import { registerCommandIB } from "../utils/vscode";
import { addActionPanelAction, deleteActionPanelAction, editActionPanelAction } from "./addActionPanelAction";
import { ActionPanelActionEditor } from "./ActionPanelActionEditor";
import { getCodiconUri } from "./getCodiconUri";
import { getConfiguredActionPanelActions } from "./getActionPanelActions";
import { registerActionPanelRefresh } from "./refresh";
import { resolveActionPanelContext } from "./resolveActionPanelContext";
import { runActionPanelItem } from "./runAction";
import type { ActionPanelAction } from "./types";

export type ActionPanelItemKind = "info" | "action";

export class ActionPanelTreeItem extends TreeItem {
    constructor(
        public readonly kind: ActionPanelItemKind,
        label: string,
        collapsibleState: TreeItemCollapsibleState,
        public readonly actionId?: string,
        description?: string,
        command?: Command,
        icon?: string,
        extensionContext?: ExtensionContext
    ) {
        super(label, collapsibleState);
        this.description = description;
        this.command = command;
        this.contextValue = kind === "action" ? "action" : kind;
        if (icon && extensionContext) {
            this.iconPath = getCodiconUri(extensionContext, icon) ?? new ThemeIcon(icon);
        }
    }
}

export class ActionPanelViewProvider implements TreeDataProvider<ActionPanelTreeItem> {
    private changeEvent = new EventEmitter<ActionPanelTreeItem | undefined | null>();
    private treeView: TreeView<ActionPanelTreeItem> | undefined;

    constructor(private readonly context: ExtensionContext) {}

    get onDidChangeTreeData(): Event<ActionPanelTreeItem | undefined | null> {
        return this.changeEvent.event;
    }

    refresh(): void {
        this.changeEvent.fire(null);
    }

    static activate(context: ExtensionContext): ActionPanelViewProvider {
        const provider = new ActionPanelViewProvider(context);
        const actionEditor = new ActionPanelActionEditor(context);
        context.subscriptions.push(actionEditor);

        provider.treeView = window.createTreeView(Views.IbUtilitiesActionPanel, {
            treeDataProvider: provider,
        });
        context.subscriptions.push(provider.treeView);

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
            (actionId: string) => provider.runAction(actionId),
            context
        );
        registerCommandIB(Commands.AddActionPanelAction, () => addActionPanelAction(actionEditor), context);
        registerCommandIB(
            Commands.EditActionPanelAction,
            (item: ActionPanelTreeItem) => {
                if (item.actionId) {
                    void editActionPanelAction(actionEditor, item.actionId);
                }
            },
            context
        );
        registerCommandIB(
            Commands.DeleteActionPanelAction,
            (item: ActionPanelTreeItem) => {
                if (item.actionId) {
                    void deleteActionPanelAction(item.actionId);
                }
            },
            context
        );

        context.subscriptions.push(
            workspace.onDidChangeConfiguration((event) => {
                if (event.affectsConfiguration("ib-utilities.actionPanel.actions")) {
                    provider.refresh();
                }
            })
        );

        return provider;
    }

    private async runAction(actionId: string): Promise<void> {
        const context = await resolveActionPanelContext();
        await runActionPanelItem(actionId, context);
    }

    getTreeItem(element: ActionPanelTreeItem): ActionPanelTreeItem {
        return element;
    }

    getChildren(element?: ActionPanelTreeItem): ActionPanelTreeItem[] {
        if (element) {
            return [];
        }

        const actions = getConfiguredActionPanelActions();
        if (actions.length === 0) {
            return [
                new ActionPanelTreeItem(
                    "info",
                    "No actions yet. Use + to add one.",
                    TreeItemCollapsibleState.None
                ),
            ];
        }

        return actions.map((action) => actionItem(action, this.context));
    }
}

function actionItem(action: ActionPanelAction, context: ExtensionContext): ActionPanelTreeItem {
    return new ActionPanelTreeItem(
        "action",
        action.label,
        TreeItemCollapsibleState.None,
        action.id,
        undefined,
        {
            command: Commands.RunActionPanelItem,
            title: action.label,
            arguments: [action.id],
        },
        action.icon,
        context
    );
}
