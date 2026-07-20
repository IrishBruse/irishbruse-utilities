import { commands, window, workspace } from "vscode";

export const GIT_HELPERS_DEBUG_MODE_CONTEXT = "ib-utilities.gitHelpers.debugMode";
const GIT_HELPERS_DEBUG_CONFIG = "ib-utilities.gitHelpers.debugMode";

export function isGitHelpersDebugMode(): boolean {
    return workspace.getConfiguration("ib-utilities").get<boolean>("gitHelpers.debugMode") === true;
}

export async function syncGitHelpersDebugModeContext(): Promise<void> {
    await commands.executeCommand("setContext", GIT_HELPERS_DEBUG_MODE_CONTEXT, isGitHelpersDebugMode());
}

export function showGitHelpersDebugAction(action: string): void {
    void window.showInformationMessage(`Git Helpers debug: ${action}`);
}
