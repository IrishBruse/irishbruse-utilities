import { env, Uri, window } from "vscode";
import { getGithubHeadFileUrls } from "../git/githubUrl";
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

async function copyGithubHeadFileUrls(repoRoot: string, relativePaths: string[]): Promise<void> {
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
    const grouped = new Map<string, string[]>();

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

        const existing = grouped.get(repoRoot);
        if (existing) {
            existing.push(relativePath);
        } else {
            grouped.set(repoRoot, [relativePath]);
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

async function copyChangesFileGithubHeadFileUrl(item: GitHelperTreeItem | undefined): Promise<void> {
    if (!item?.repoRoot || !item.relativePath) {
        return;
    }

    if (isGitHelpersDebugMode() && item.repoRoot === MOCK_REPO_ROOT) {
        const mock = getGitHelpersMockState();
        const url = `https://github.com/irishbruse/irishbruse-utilities/blob/${mock.branch}/${item.relativePath}`;
        await env.clipboard.writeText(url);
        showGitHelpersDebugAction(`Copy GitHub head URL: ${item.relativePath}`);
        return;
    }

    await copyGithubHeadFileUrls(item.repoRoot, [item.relativePath]);
}

export async function copyGithubHeadFileUrl(
    arg?: GitHelperTreeItem | Uri | Parameters<typeof resolveCommandFileResources>[0],
    selectedResources?: Uri | Uri[]
): Promise<void> {
    if (arg && typeof arg === "object" && "kind" in arg && arg.kind === "changesFile") {
        await copyChangesFileGithubHeadFileUrl(arg);
        return;
    }

    await copyResourcesGithubHeadFileUrl(resolveCommandFileResources(arg, selectedResources));
}
