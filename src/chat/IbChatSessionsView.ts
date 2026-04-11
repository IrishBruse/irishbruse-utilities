import {
    commands,
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
import { getAcpAgentConfigByName, getAcpAgentConfigs } from "./acp/acpAgentConfig";
import { disposeIbChatEditorForSession, openOrRevealIbChatEditor } from "./ibChatEditor";
import {
    getActiveIbChatSessionId,
    IbChatSessionRecord,
    listIbChatSessions,
    removeIbChatSession,
    setActiveIbChatSessionId,
} from "./ibChatSessionsStore";
import { registerCommandIB } from "../utils/vscode";

const iconChat = "comment-discussion";

type IbChatSessionsTreeNode = IbChatSessionTreeItem | IbChatPlaceholderTreeItem;

class IbChatPlaceholderTreeItem extends TreeItem {
    constructor() {
        super("No chats yet — use New IB Chat in Editor above", TreeItemCollapsibleState.None);
        this.contextValue = "placeholder";
        this.tooltip = "Use New IB Chat in Editor on the Chats view title to create a chat";
    }
}

class IbChatSessionTreeItem extends TreeItem {
    constructor(
        public readonly sessionId: string,
        label: string,
        isActive: boolean
    ) {
        super(label, TreeItemCollapsibleState.None);
        this.contextValue = "session";
        this.description = isActive ? "active" : undefined;
        this.tooltip = label;
        this.iconPath = new ThemeIcon(iconChat);
        this.command = {
            title: "Open Chat",
            command: Commands.OpenIbChatSession,
            arguments: [sessionId],
        };
    }
}

export class IbChatSessionsViewProvider implements TreeDataProvider<IbChatSessionsTreeNode> {
    private changeEvent = new EventEmitter<IbChatSessionsTreeNode | undefined>();

    private readonly extensionContext: ExtensionContext;

    private constructor(extensionContext: ExtensionContext) {
        this.extensionContext = extensionContext;
    }

    /**
     * Fires when the Chats tree should refresh.
     */
    public get onDidChangeTreeData(): Event<IbChatSessionsTreeNode | undefined> {
        return this.changeEvent.event;
    }

    /**
     * Registers the Chats tree view and session commands.
     */
    static activate(context: ExtensionContext): void {
        const provider = new IbChatSessionsViewProvider(context);
        context.subscriptions.push(window.registerTreeDataProvider(Views.IbChatSessionsView, provider));

        registerCommandIB(Commands.RefreshIbChatSessions, () => provider.refresh(), context);
        registerCommandIB(Commands.OpenIbChatSession, (id?: string) => provider.openSession(id), context);
        registerCommandIB(Commands.DeleteIbChatSession, (item: IbChatSessionsTreeNode | undefined) =>
            provider.deleteSession(item)
        , context);
        registerCommandIB(
            Commands.FocusIbChatSessions,
            () => commands.executeCommand(`${Views.IbChatSessionsView}.focus`),
            context
        );
    }

    refresh(): void {
        this.changeEvent.fire(undefined);
    }

    getTreeItem(element: IbChatSessionsTreeNode): TreeItem {
        return element;
    }

    async getChildren(element?: IbChatSessionsTreeNode): Promise<IbChatSessionsTreeNode[]> {
        if (element) {
            return [];
        }
        const rows = listIbChatSessions();
        if (rows.length === 0) {
            return [new IbChatPlaceholderTreeItem()];
        }
        const active = getActiveIbChatSessionId();
        return rows.map((row) => this.toTreeItem(row, active));
    }

    getParent(): undefined {
        return undefined;
    }

    private toTreeItem(row: IbChatSessionRecord, activeId: string | null): IbChatSessionTreeItem {
        return new IbChatSessionTreeItem(row.id, row.title, row.id === activeId);
    }

    private async openSession(sessionId?: string): Promise<void> {
        if (typeof sessionId !== "string" || sessionId.length === 0) {
            window.showInformationMessage("Choose a chat from the Chats list");
            return;
        }
        const row = listIbChatSessions().find((s) => s.id === sessionId);
        if (!row) {
            window.showErrorMessage("That chat no longer exists");
            this.refresh();
            return;
        }
        setActiveIbChatSessionId(sessionId);
        this.refresh();
        const agentConfig =
            row.agentName !== undefined
                ? getAcpAgentConfigByName(row.agentName)
                : getAcpAgentConfigs()[0];
        openOrRevealIbChatEditor(this.extensionContext, sessionId, row.title, agentConfig);
    }

    private async deleteSession(item: IbChatSessionsTreeNode | undefined): Promise<void> {
        if (!item || !("sessionId" in item)) {
            window.showErrorMessage("Select a chat in the Chats list");
            return;
        }
        const row = listIbChatSessions().find((s) => s.id === item.sessionId);
        const labelText = row?.title ?? "chat";
        const answer = await window.showWarningMessage(
            `Delete chat "${labelText}"? This cannot be undone.`,
            { modal: true },
            "Delete"
        );
        if (answer !== "Delete") {
            return;
        }
        disposeIbChatEditorForSession(item.sessionId);
        removeIbChatSession(item.sessionId);
        this.refresh();
    }
}
