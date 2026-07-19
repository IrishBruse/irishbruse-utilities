import { window } from "vscode";
import { asyncSpawn } from "../utils/asyncSpawn";
import { getPrInfo, type GhPrInfo } from "./githubUrl";

/**
 * Create a blank draft PR for the current branch (no title prompt, empty body).
 */
export async function createBlankDraftPullRequest(
    repoRoot: string,
    branch: string,
    baseBranch: string
): Promise<GhPrInfo | undefined> {
    const result = await asyncSpawn(
        "gh",
        [
            "pr",
            "create",
            "--draft",
            "--push",
            "--base",
            baseBranch,
            "--title",
            branch,
            "--body",
            "",
        ],
        { cwd: repoRoot }
    );

    if (result.status !== 0) {
        window.showErrorMessage(`Failed to create draft PR: ${result.stderr || result.stdout}`);
        return undefined;
    }

    return getPrInfo(repoRoot, branch);
}
