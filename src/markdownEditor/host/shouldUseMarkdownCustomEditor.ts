import { Uri, window } from "vscode";

const DIRECT_EDIT_SCHEMES = new Set([
    "file",
    "untitled",
    "vscode-remote",
    "vscode-vfs",
]);

export function isDirectMarkdownEditUri(uri: Uri): boolean {
    return DIRECT_EDIT_SCHEMES.has(uri.scheme);
}

function sameResource(left: Uri, right: Uri): boolean {
    return left.scheme === right.scheme
        && left.path === right.path
        && (left.query ?? "") === (right.query ?? "");
}

function isUriLike(value: unknown): value is Uri {
    return !!value
        && typeof value === "object"
        && typeof (value as Uri).scheme === "string"
        && typeof (value as Uri).path === "string";
}

function collectDiffUris(input: unknown, into: Uri[]): void {
    if (!input || typeof input !== "object") {
        return;
    }
    const record = input as { original?: unknown; modified?: unknown; resources?: unknown };
    if (isUriLike(record.original)) {
        into.push(record.original);
    }
    if (isUriLike(record.modified)) {
        into.push(record.modified);
    }
    if (!Array.isArray(record.resources)) {
        return;
    }
    for (const resource of record.resources) {
        if (!resource || typeof resource !== "object") {
            continue;
        }
        const side = resource as { original?: unknown; modified?: unknown };
        if (isUriLike(side.original)) {
            into.push(side.original);
        }
        if (isUriLike(side.modified)) {
            into.push(side.modified);
        }
    }
}

export function isMarkdownUriInDiffTab(uri: Uri): boolean {
    for (const group of window.tabGroups.all) {
        for (const tab of group.tabs) {
            const sides: Uri[] = [];
            collectDiffUris(tab.input, sides);
            if (sides.some((side) => sameResource(side, uri))) {
                return true;
            }
        }
    }
    return false;
}


export function shouldUseMarkdownCustomEditor(uri: Uri): boolean {
    return isDirectMarkdownEditUri(uri) && !isMarkdownUriInDiffTab(uri);
}
