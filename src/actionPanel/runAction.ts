import { commands, window } from "vscode";
import { openPR } from "../commands/openPR";
import { openBranchDiff } from "../git/openBranchDiff";
import { publishReviewToPR } from "../git/publishReview";
import { openAgentInEditorTerminal } from "../utils/openAgentTerminal";
import { getActionPanelAction } from "./getActionPanelActions";
import { refreshActionPanel } from "./refresh";
import { substituteVariables } from "./substituteVariables";
import type { ActionPanelContext } from "./types";

async function runBuiltinAction(builtin: NonNullable<ReturnType<typeof getActionPanelAction>>["builtin"], context: ActionPanelContext): Promise<void> {
    switch (builtin) {
        case "openPR":
            await openPR(undefined, context.repoRoot);
            return;
        case "diffWithBase":
            await openBranchDiff(context.repoRoot);
            return;
        case "publishReview":
            if (!context.branch) {
                window.showWarningMessage("No active branch to publish review notes from.");
                return;
            }
            await publishReviewToPR(context.repoRoot, context.branch);
            refreshActionPanel();
            return;
    }
}

export async function runActionPanelItem(actionId: string, context: ActionPanelContext): Promise<void> {
    const action = getActionPanelAction(actionId);
    if (!action) {
        window.showWarningMessage(`Unknown action: ${actionId}`);
        return;
    }

    switch (action.type) {
        case "builtin":
            if (!action.builtin) {
                return;
            }
            await runBuiltinAction(action.builtin, context);
            return;
        case "agent":
            if (!action.prompt) {
                return;
            }
            openAgentInEditorTerminal(
                substituteVariables(action.prompt, context),
                context.repoRoot,
                action.terminalName ?? action.label
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
