import { stat } from "fs/promises";
import { env, Uri, window } from "vscode";
import { getGithubHeadFileUrls, type GithubHeadPath } from "../git/githubUrl";
import { gitRepositoryRootForUri, gitRepositoryRootForUriSync } from "../git/gitRepositoryRoot";
import { GitHelperTreeItem } from "../gitHelpers/GitHelperTreeItem";
import { isGitHelpersDebugMode, showGitHelpersDebugAction } from "../gitHelpers/debugMode";
import { getGitHelpersMockState, MOCK_REPO_ROOT } from "../gitHelpers/mockData";
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

async function copyGithubHeadFileUrls(repoRoot: string, relativePaths: GithubHeadPath[]): Promise<void> {
    const urls = await getGithubHeadFileUrls(repoRoot, relativePaths);
    if (!urls?.length) {
        window.showWarningMessage("Could not build GitHub head URL for the selected file(s).");
        return;
    }

    await env.clipboard.writeText(urls.join("\n"));
    const message =
        urls.length === 1
            ? "GitHub head URL copied to clipboard."
            : `${urls.length} GitHub head URLs copied to clipboard.`;
    window.showInformationMessage(message);
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
        window.showWarningMessage("Could not build GitHub head URL for the selected file(s).");
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
        window.showWarningMessage("Could not build GitHub head URL for the selected file(s).");
        return;
    }

    await env.clipboard.writeText(allUrls.join("\n"));
    const message =
        allUrls.length === 1
            ? "GitHub head URL copied to clipboard."
            : `${allUrls.length} GitHub head URLs copied to clipboard.`;
    window.showInformationMessage(message);
}

async function copyChangesGithubHeadFileUrl(item: GitHelperTreeItem | undefined): Promise<void> {
    if (!item?.repoRoot || !item.relativePath) {
        return;
    }

    const isDirectory = item.kind === "changesFolder";

    if (isGitHelpersDebugMode() && item.repoRoot === MOCK_REPO_ROOT) {
        const mock = getGitHelpersMockState();
        const kind = isDirectory ? "tree" : "blob";
        const url = `https://github.com/irishbruse/irishbruse-utilities/${kind}/${mock.branch}/${item.relativePath}`;
        await env.clipboard.writeText(url);
        showGitHelpersDebugAction(`Copy GitHub head URL: ${item.relativePath}`);
        return;
    }

    await copyGithubHeadFileUrls(item.repoRoot, [{ relativePath: item.relativePath, isDirectory }]);
}

export async function copyGithubHeadFileUrl(
    arg?: GitHelperTreeItem | Uri | Parameters<typeof resolveCommandFileResources>[0],
    selectedResources?: Uri | Uri[]
): Promise<void> {
    if (
        arg &&
        typeof arg === "object" &&
        "kind" in arg &&
        (arg.kind === "changesFile" || arg.kind === "changesFolder")
    ) {
        await copyChangesGithubHeadFileUrl(arg);
        return;
    }

    await copyResourcesGithubHeadFileUrl(resolveCommandFileResources(arg, selectedResources));
}
