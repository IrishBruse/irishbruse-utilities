import { env, Uri, window } from "vscode";
import { getOriginUrl, githubRepoWebUrl } from "../git/githubUrl";
import { resolveRepositoryPath } from "../git/resolveRepositoryPath";

export async function openRepo(sourceControl?: import("vscode").SourceControl, repoPath?: string): Promise<void> {
    const resolvedPath = repoPath ?? (await resolveRepositoryPath(sourceControl));
    if (!resolvedPath) {
        window.showWarningMessage("Could not determine repository path.");
        return;
    }

    const origin = await getOriginUrl(resolvedPath);
    if (!origin) {
        window.showWarningMessage("Could not read origin remote.");
        return;
    }

    const repoWebUrl = githubRepoWebUrl(origin);
    if (!repoWebUrl) {
        window.showWarningMessage("Origin is not a recognized GitHub remote.");
        return;
    }

    await env.openExternal(Uri.parse(repoWebUrl));
}
