import { env, Uri, window, type SourceControl } from "vscode";
import { getOriginUrl, githubRepoWebUrl } from "./githubUrl";
import { resolveRepositoryPath } from "./resolveRepositoryPath";

export async function openRepo(sourceControl?: SourceControl, repoPath?: string): Promise<void> {
    const resolvedPath = repoPath ?? (await resolveRepositoryPath(sourceControl));
    if (!resolvedPath) {
        void window.showWarningMessage("Could not determine repository path.");
        return;
    }

    const origin = await getOriginUrl(resolvedPath);
    if (!origin) {
        void window.showWarningMessage("Could not read origin remote.");
        return;
    }

    const repoWebUrl = githubRepoWebUrl(origin);
    if (!repoWebUrl) {
        void window.showWarningMessage("Origin is not a recognized GitHub remote.");
        return;
    }

    await env.openExternal(Uri.parse(repoWebUrl));
}
