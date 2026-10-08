import { window } from "vscode";
import { spawnGh } from "./ghCli";
import { getPrInfo, type GhPrInfo } from "./githubUrl";

export async function markPullRequestReady(repoRoot: string, branch: string): Promise<GhPrInfo | undefined> {
    const result = await spawnGh(repoRoot, ["pr", "ready", branch]);
    if (result.status !== 0) {
        window.showErrorMessage(`Failed to mark PR as ready: ${result.stderr || result.stdout}`);
        return undefined;
    }
    return getPrInfo(repoRoot, branch);
}
