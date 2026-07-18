import { commands, window } from "vscode";
import { resolveRepositoryPath } from "./resolveRepositoryPath";
import { getActiveReviewSession } from "./reviewSession";

/**
 * Excludes the current selection from the curated review set:
 * unstages it, then restores working tree to HEAD (merge-base) as unstaged removals.
 */
export async function excludeFromReview(repoRoot?: string): Promise<void> {
    const editor = window.activeTextEditor;
    if (!editor) {
        window.showWarningMessage("Open a diff or file to exclude a selection.");
        return;
    }

    const resolvedRoot = repoRoot ?? getActiveReviewSession()?.repoRoot ?? (await resolveRepositoryPath());
    const session = getActiveReviewSession(resolvedRoot);
    if (!session) {
        window.showWarningMessage("Start a branch review first.");
        return;
    }

    const selection = editor.selection;
    if (selection.isEmpty) {
        window.showWarningMessage("Select lines in the diff to exclude from review.");
        return;
    }

    try {
        await commands.executeCommand("git.unstageSelectedRanges", editor.document.uri, [selection], editor.document);
        await commands.executeCommand("git.revertSelectedRanges", editor.document.uri, [selection], editor.document);
    } catch (error) {
        window.showErrorMessage(`Failed to exclude selection: ${(error as Error).message}`);
    }
}
