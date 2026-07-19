import { commands } from "vscode";
import { openAgentInEditorTerminal } from "../utils/openAgentTerminal";
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
    }
}
