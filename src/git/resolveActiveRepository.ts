import { window } from "vscode";
import type { API, Repository } from "./gitApi";
import { getGitApi, getGitApiAsync } from "./getGitApi";

/**
 * Resolves the SCM-active repository: selected in Source Control, then active editor, then sole repo.
 */
export function resolveActiveRepository(api: API): Repository | undefined {
    const selected = api.repositories.filter((repo) => repo.ui.selected);
    if (selected.length >= 1) {
        return selected[0];
    }

    const editorUri = window.activeTextEditor?.document.uri;
    if (editorUri) {
        const fromEditor = api.getRepository(editorUri);
        if (fromEditor) {
            return fromEditor;
        }
    }

    if (api.repositories.length === 1) {
        return api.repositories[0];
    }

    return undefined;
}

export async function getActiveRepository(): Promise<Repository | undefined> {
    const api = getGitApi() ?? (await getGitApiAsync());
    if (!api) {
        return undefined;
    }
    return resolveActiveRepository(api);
}
