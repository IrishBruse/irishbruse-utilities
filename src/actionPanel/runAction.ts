import { commands } from "vscode";
import { openAgentInEditorTerminal } from "../utils/openAgentTerminal";
import { openTerminalCommand } from "../utils/openTerminalCommand";
import { getActionPanelAction } from "./getActionPanelActions";
import { substituteVariables } from "./substituteVariables";
import type { ActionPanelContext } from "./types";

export async function runActionPanelItem(actionId: string, context: ActionPanelContext): Promise<void> {
    const action = getActionPanelAction(actionId);
    if (!action) {
        return;
    }

    switch (action.type) {
        case "agent":
            if (!action.prompt) {
                return;
            }
            openAgentInEditorTerminal(
                substituteVariables(action.prompt, context),
                context.repoRoot,
                action.label
            );
            return;
        case "command":
            if (!action.command) {
                return;
            }
            await commands.executeCommand(action.command, ...(action.args ?? []));
            return;
        case "terminal":
            if (!action.command) {
                return;
            }
            openTerminalCommand({
                command: substituteVariables(action.command, context),
                cwd: context.repoRoot,
                name: action.label,
                terminalMode: action.terminalMode,
            });
            return;
    }
}
