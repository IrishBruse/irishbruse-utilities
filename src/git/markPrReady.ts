import { window } from "vscode";
import { asyncSpawn } from "../utils/asyncSpawn";
import { getPrInfo, type GhPrInfo } from "./githubUrl";

export async function markPullRequestReady(repoRoot: string, branch: string): Promise<GhPrInfo | undefined> {
    const result = await asyncSpawn("gh", ["pr", "ready", branch], { cwd: repoRoot });
    if (result.status !== 0) {
        window.showErrorMessage(`Failed to mark PR as ready: ${result.stderr || result.stdout}`);
        return undefined;
    }
    return getPrInfo(repoRoot, branch);
}
