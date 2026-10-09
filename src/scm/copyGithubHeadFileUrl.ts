import { stat } from "fs/promises";
import { env, Uri, window } from "vscode";
import { getGithubHeadFileUrls, type GithubHeadPath } from "../lib/git/githubUrl";
import { gitRepositoryRootForUri, gitRepositoryRootForUriSync } from "../lib/git/gitRepositoryRoot";
import {
    relativePathsForScmResources,
    resolveCommandFileResources,
    type ScmResourceContext,
} from "./copyResourcePath";

async function repoRootForResource(resource: ScmResourceContext): Promise<string | undefined> {
    return (
        resource.repoRoot ??
        gitRepositoryRootForUriSync(resource.uri) ??
        (await gitRepositoryRootForUri(resource.uri))
    );
}

async function isDirectoryResource(resource: ScmResourceContext): Promise<boolean> {
    try {
        return (await stat(resource.uri.fsPath)).isDirectory();
    } catch {
        return false;
    }
}

async function copyResourcesGithubHeadFileUrl(resources: ScmResourceContext[]): Promise<void> {
    if (!resources.length) {
        return;
    }

    const paths = await relativePathsForScmResources(resources);
    const grouped = new Map<string, GithubHeadPath[]>();

    for (let index = 0; index < resources.length; index++) {
        const resource = resources[index];
        const relativePath = paths[index];
        if (!relativePath) {
            continue;
        }

        const repoRoot = await repoRootForResource(resource);
        if (!repoRoot) {
            continue;
        }

        const entry = { relativePath, isDirectory: await isDirectoryResource(resource) };
        const existing = grouped.get(repoRoot);
        if (existing) {
            existing.push(entry);
        } else {
            grouped.set(repoRoot, [entry]);
        }
    }

    if (!grouped.size) {
        void window.showWarningMessage("Could not build GitHub head URL for the selected file(s).");
        return;
    }

    const allUrls: string[] = [];
    for (const [repoRoot, relativePaths] of grouped) {
        const urls = await getGithubHeadFileUrls(repoRoot, relativePaths);
        if (urls) {
            allUrls.push(...urls);
        }
    }

    if (!allUrls.length) {
        void window.showWarningMessage("Could not build GitHub head URL for the selected file(s).");
        return;
    }

    await env.clipboard.writeText(allUrls.join("\n"));
    const message =
        allUrls.length === 1
            ? "GitHub head URL copied to clipboard."
            : `${allUrls.length} GitHub head URLs copied to clipboard.`;
    void window.showInformationMessage(message);
}

export async function copyGithubHeadFileUrl(
    arg?: Uri | Parameters<typeof resolveCommandFileResources>[0],
    selectedResources?: Uri | Uri[]
): Promise<void> {
    await copyResourcesGithubHeadFileUrl(resolveCommandFileResources(arg, selectedResources));
}
