import { window } from "vscode";
import { asyncSpawn } from "../asyncSpawn/asyncSpawn";
import { spawnGh } from "./ghCli";
import { getPrInfo, type GhPrInfo } from "./githubUrl";

export async function pushBranchToOrigin(repoRoot: string, branch: string): Promise<boolean> {
    const result = await asyncSpawn("git", ["push", "-u", "origin", branch], { cwd: repoRoot });
    if (result.status !== 0) {
        window.showErrorMessage(`Failed to push branch: ${result.stderr || result.stdout}`);
        return false;
    }
    return true;
}


export async function createBlankDraftPullRequest(
    repoRoot: string,
    branch: string,
    baseBranch: string
): Promise<GhPrInfo | undefined> {
    if (!(await pushBranchToOrigin(repoRoot, branch))) {
        return undefined;
    }

    const result = await spawnGh(repoRoot, [
        "pr",
        "create",
        "--draft",
        "--base",
        baseBranch,
        "--title",
        branch,
        "--body",
        "",
    ]);

    if (result.status !== 0) {
        window.showErrorMessage(`Failed to create draft PR: ${result.stderr || result.stdout}`);
        return undefined;
    }

    return getPrInfo(repoRoot, branch);
}
