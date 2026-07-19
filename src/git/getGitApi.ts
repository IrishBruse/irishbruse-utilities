import { extensions } from "vscode";
import type { API, GitExtension } from "./gitApi";

export async function getGitExtensionAsync(): Promise<GitExtension | undefined> {
    const extension = extensions.getExtension<GitExtension>("vscode.git");
    if (!extension) {
        return undefined;
    }
    if (!extension.isActive) {
        await extension.activate();
    }
    return extension.exports;
}

export function getGitExtension(): GitExtension | undefined {
    const extension = extensions.getExtension<GitExtension>("vscode.git");
    if (!extension?.isActive) {
        return undefined;
    }
    return extension.exports;
}

export function getGitApi(): API | undefined {
    const gitExtension = getGitExtension();
    if (!gitExtension?.enabled) {
        return undefined;
    }
    try {
        return gitExtension.getAPI(1);
    } catch {
        return undefined;
    }
}

export async function getGitApiAsync(): Promise<API | undefined> {
    const gitExtension = await getGitExtensionAsync();
    if (!gitExtension?.enabled) {
        return undefined;
    }
    try {
        return gitExtension.getAPI(1);
    } catch {
        return undefined;
    }
}

export type ResolvedGitApi =
    | { status: "ready"; api: API }
    | { status: "loading" }
    | { status: "unavailable" };

export async function resolveGitApi(): Promise<ResolvedGitApi> {
    let api = getGitApi();
    if (!api) {
        api = await getGitApiAsync();
    }
    if (!api) {
        return { status: "unavailable" };
    }
    if (api.state !== "initialized") {
        return { status: "loading" };
    }
    return { status: "ready", api };
}

export function getRepositoryByRoot(rootPath: string): import("./gitApi").Repository | undefined {
    const api = getGitApi();
    if (!api) {
        return undefined;
    }
    const normalized = rootPath.replace(/\\/g, "/");
    return api.repositories.find((repo) => repo.rootUri.fsPath.replace(/\\/g, "/") === normalized);
}
