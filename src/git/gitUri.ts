import { Uri } from "vscode";
import type { Change } from "./gitApi";
import { Status } from "./gitApi";

export interface GitUriParams {
    path: string;
    ref: string;
    submoduleOf?: string;
}

export function toGitUri(uri: Uri, ref: string): Uri {
    const params: GitUriParams = { path: uri.fsPath, ref };
    return uri.with({ scheme: "git", query: JSON.stringify(params) });
}

export function toMultiFileDiffEditorUris(
    change: Change,
    originalRef: string,
    modifiedRef: string
): { originalUri: Uri | undefined; modifiedUri: Uri | undefined } {
    switch (change.status) {
        case Status.INDEX_ADDED:
            return { originalUri: undefined, modifiedUri: toGitUri(change.uri, modifiedRef) };
        case Status.DELETED:
            return { originalUri: toGitUri(change.uri, originalRef), modifiedUri: undefined };
        case Status.INDEX_RENAMED:
            return {
                originalUri: toGitUri(change.originalUri, originalRef),
                modifiedUri: toGitUri(change.uri, modifiedRef),
            };
        default:
            return {
                originalUri: toGitUri(change.uri, originalRef),
                modifiedUri: toGitUri(change.uri, modifiedRef),
            };
    }
}
