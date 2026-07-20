import { env, Uri, window } from "vscode";
import { getRepositoryByRoot } from "../git/getGitApi";
import { getPrChangesUrl, getPrInfo } from "../git/githubUrl";
import { getActiveRepository } from "../git/resolveActiveRepository";

export async function openPrChanges(repoPath?: string, changesUrl?: string): Promise<void> {
    if (changesUrl) {
        await env.openExternal(Uri.parse(changesUrl));
        return;
    }

    const repoRoot = repoPath ?? (await getActiveRepository())?.rootUri.fsPath;
    if (!repoRoot) {
        window.showWarningMessage("No active git repository. Select one in Source Control.");
        return;
    }

    const repository = getRepositoryByRoot(repoRoot) ?? (await getActiveRepository());
    const branch = repository?.state.HEAD?.name;
    if (!branch) {
        window.showWarningMessage("No named branch checked out.");
        return;
    }

    const pr = await getPrInfo(repoRoot, branch);
    if (!pr) {
        window.showWarningMessage("No pull request found for the current branch.");
        return;
    }

    await env.openExternal(Uri.parse(getPrChangesUrl(pr.url)));
}
