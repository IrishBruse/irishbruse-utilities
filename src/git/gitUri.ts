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

function workingTreeUri(change: Change): Uri | undefined {
    switch (change.status) {
        case Status.DELETED:
        case Status.INDEX_DELETED:
        case Status.DELETED_BY_US:
        case Status.DELETED_BY_THEM:
        case Status.BOTH_DELETED:
            return undefined;
        default:
            return change.uri;
    }
}

export function toMultiFileDiffEditorUris(
    change: Change,
    originalRef: string,
    _modifiedRef: string
): { originalUri: Uri | undefined; modifiedUri: Uri | undefined } {
    const modifiedUri = workingTreeUri(change);

    switch (change.status) {
        case Status.INDEX_ADDED:
            return { originalUri: undefined, modifiedUri };
        case Status.DELETED:
            return { originalUri: toGitUri(change.uri, originalRef), modifiedUri: undefined };
        case Status.INDEX_RENAMED:
            return {
                originalUri: toGitUri(change.originalUri, originalRef),
                modifiedUri,
            };
        default:
            return {
                originalUri: toGitUri(change.uri, originalRef),
                modifiedUri,
            };
    }
}
