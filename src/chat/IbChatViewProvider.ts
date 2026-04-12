import { commands, Disposable, ExtensionContext, Uri, window } from "vscode";
import { Commands } from "../constants";
import { openNewIbChatEditor } from "./ibChatEditor";
import { disposeIbChatAcpRpcLogFile, registerIbChatAcpRpcOutput } from "./ibChatAcpRpcOutput";
import { IbChatSessionsViewProvider } from "./IbChatSessionsView";
import { pickAcpAgentConfig } from "./ibChatAgentPicker";
import {
    addIbChatSession,
    listIbChatSessions,
    setActiveIbChatSessionId,
} from "./ibChatSessionsStore";
import { registerCommandIB } from "../utils/vscode";

/**
 * Registers IB Chat sessions (sidebar tree) and editor webview commands. There is no docked chat webview.
 */
export function activateIbChatView(context: ExtensionContext): void {
    const acpRpcLog = window.createOutputChannel("IB Chat ACP RPC");
    const acpRpcLogFileUri = Uri.joinPath(context.globalStorageUri, "ib-chat-acp-rpc.ndjson");
    const acpRpcLogFilePath = acpRpcLogFileUri.fsPath;
    registerIbChatAcpRpcOutput(acpRpcLog, acpRpcLogFilePath);
    context.subscriptions.push(acpRpcLog);
    context.subscriptions.push(new Disposable(() => disposeIbChatAcpRpcLogFile()));
    registerCommandIB(
        Commands.ShowIbChatAcpRpcLog,
        () => {
            acpRpcLog.show(true);
        },
        context
    );
    IbChatSessionsViewProvider.activate(context);
    registerCommandIB(
        Commands.NewIbChatEditor,
        async () => {
            const agentConfig = await pickAcpAgentConfig();
            if (!agentConfig) {
                return;
            }
            const nextIndex = listIbChatSessions().length + 1;
            const created = addIbChatSession(`Chat ${nextIndex}`, { agentName: agentConfig.name });
            setActiveIbChatSessionId(created.id);
            openNewIbChatEditor(context, created.id, created.title, agentConfig);
            void commands.executeCommand(Commands.RefreshIbChatSessions);
        },
        context
    );
}
