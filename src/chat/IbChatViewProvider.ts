import { commands, ExtensionContext } from "vscode";
import { Commands } from "../constants";
import { openNewIbChatEditor } from "./ibChatEditor";
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
