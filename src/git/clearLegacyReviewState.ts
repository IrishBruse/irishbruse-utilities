import { commands, ExtensionContext } from "vscode";

const SESSION_KEY = "ib-utilities.branchReviewSession";
const REVIEW_CONTEXT = "ib-utilities.inBranchReview";

/** Clears persisted branch-review session state from older extension versions. */
export async function clearLegacyBranchReviewState(context: ExtensionContext): Promise<void> {
    await context.workspaceState.update(SESSION_KEY, undefined);
    await commands.executeCommand("setContext", REVIEW_CONTEXT, false);
}
