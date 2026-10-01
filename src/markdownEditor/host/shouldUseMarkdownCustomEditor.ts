import { commands, Uri, ViewColumn, window, workspace } from "vscode";

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

const DIFF_URI_KEYS = ["original", "modified", "base", "input1", "input2", "result"] as const;

function collectDiffUris(input: unknown, into: Uri[]): void {
    if (!input || typeof input !== "object") {
        return;
    }
    const record = input as Record<string, unknown>;
    for (const key of DIFF_URI_KEYS) {
        if (isUriLike(record[key])) {
            into.push(record[key]);
        }
    }
    for (const listKey of ["resources", "textDiffs"] as const) {
        if (!Array.isArray(record[listKey])) {
            continue;
        }
        for (const resource of record[listKey]) {
            collectDiffUris(resource, into);
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

function hasNonDirectMarkdownCounterpart(uri: Uri): boolean {
    for (const document of workspace.textDocuments ?? []) {
        if (document.uri.path !== uri.path) {
            continue;
        }
        if (sameResource(document.uri, uri)) {
            continue;
        }
        if (!isDirectMarkdownEditUri(document.uri)) {
            return true;
        }
    }
    return false;
}

export function shouldUseMarkdownCustomEditor(uri: Uri): boolean {
    return isDirectMarkdownEditUri(uri)
        && !isMarkdownUriInDiffTab(uri)
        && !hasNonDirectMarkdownCounterpart(uri);
}

const rawOpenInFlight = new Set<string>();

export async function openMarkdownWithRawEditor(uri: Uri, viewColumn?: ViewColumn): Promise<void> {
    const key = uri.path;
    if (rawOpenInFlight.has(key)) {
        return;
    }
    rawOpenInFlight.add(key);
    try {
        const counterpart = [...(workspace.textDocuments ?? [])].find((document) => {
            return document.uri.path === uri.path
                && !sameResource(document.uri, uri)
                && !isDirectMarkdownEditUri(document.uri);
        })?.uri;
        if (counterpart && !isMarkdownUriInDiffTab(uri)) {
            const original = isDirectMarkdownEditUri(uri) ? counterpart : uri;
            const modified = original === uri ? counterpart : uri;
            await commands.executeCommand(
                "_workbench.diff",
                original,
                modified,
                undefined,
                undefined,
                { editorOptions: { override: "default" } },
            );
            return;
        }
        await commands.executeCommand(
            "vscode.openWith",
            uri,
            "default",
            viewColumn === undefined ? undefined : { viewColumn },
        );
    } finally {
        rawOpenInFlight.delete(key);
    }
}
