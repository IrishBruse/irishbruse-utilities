import { TabInputTextDiff, Uri, window } from "vscode";

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

export function isMarkdownUriInDiffTab(uri: Uri): boolean {
    for (const group of window.tabGroups.all) {
        for (const tab of group.tabs) {
            const input = tab.input;
            if (!(input instanceof TabInputTextDiff)) {
                continue;
            }
            if (sameResource(input.original, uri) || sameResource(input.modified, uri)) {
                return true;
            }
        }
    }
    return false;
}

/** True when the Markdown Editor should own the document (not SCM/history diffs). */
export function shouldUseMarkdownCustomEditor(uri: Uri): boolean {
    return isDirectMarkdownEditUri(uri) && !isMarkdownUriInDiffTab(uri);
}
