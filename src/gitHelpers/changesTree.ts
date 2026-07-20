import path from "path";
import { TreeItemCollapsibleState, Uri } from "vscode";
import { Commands } from "../constants";
import type { DiffChange } from "../git/gitApi";
import { GitHelperTreeItem } from "./GitHelperTreeItem";

export type ChangesTreeCache = {
    mergeBaseRef: string;
    changesByRelativePath: Map<string, DiffChange>;
    paths: string[];
};

type TreeNode = {
    folders: Map<string, TreeNode>;
    files: string[];
};

function insertPath(node: TreeNode, parts: string[]): void {
    if (parts.length === 1) {
        node.files.push(parts[0]);
        return;
    }

    const [folder, ...rest] = parts;
    let child = node.folders.get(folder);
    if (!child) {
        child = { folders: new Map(), files: [] };
        node.folders.set(folder, child);
    }
    insertPath(child, rest);
}

function buildTreeFromPaths(paths: readonly string[]): TreeNode {
    const root: TreeNode = { folders: new Map(), files: [] };
    for (const relativePath of paths) {
        insertPath(root, relativePath.split("/"));
    }
    return root;
}

function nodeAtPath(root: TreeNode, parts: string[]): TreeNode | undefined {
    let node: TreeNode = root;
    for (const part of parts) {
        const child = node.folders.get(part);
        if (!child) {
            return undefined;
        }
        node = child;
    }
    return node;
}

export function createChangesTreeCache(
    repoRoot: string,
    mergeBaseRef: string,
    changes: readonly DiffChange[]
): ChangesTreeCache {
    const changesByRelativePath = new Map<string, DiffChange>();
    const paths: string[] = [];
    for (const change of changes) {
        const relativePath = path.relative(repoRoot, change.uri.fsPath).split(path.sep).join("/");
        changesByRelativePath.set(relativePath, change);
        paths.push(relativePath);
    }
    return { mergeBaseRef, changesByRelativePath, paths };
}

export function buildChangesChildren(
    repoRoot: string,
    cache: ChangesTreeCache,
    parentId: string
): GitHelperTreeItem[] {
    const root = buildTreeFromPaths(cache.paths);
    const relativeParts =
        parentId === `${repoRoot}:changes`
            ? []
            : parentId.replace(`${repoRoot}:changes/`, "").split("/").filter(Boolean);
    const node = nodeAtPath(root, relativeParts);
    if (!node) {
        return [];
    }

    const items: GitHelperTreeItem[] = [];

    for (const folderName of [...node.folders.keys()].sort()) {
        const folderId =
            parentId === `${repoRoot}:changes` ? `${repoRoot}:changes/${folderName}` : `${parentId}/${folderName}`;
        const folderRelativePath =
            relativeParts.length === 0 ? folderName : `${relativeParts.join("/")}/${folderName}`;
        const folderItem = new GitHelperTreeItem(
            "changesFolder",
            repoRoot,
            folderName,
            TreeItemCollapsibleState.Collapsed,
            folderId,
            undefined,
            undefined,
            undefined,
            cache.mergeBaseRef
        );
        folderItem.resourceUri = Uri.file(path.join(repoRoot, folderRelativePath));
        folderItem.contextValue = "changes-folder";
        items.push(folderItem);
    }

    for (const fileName of [...node.files].sort()) {
        const relativePath =
            relativeParts.length === 0 ? fileName : `${relativeParts.join("/")}/${fileName}`;
        const fileId =
            parentId === `${repoRoot}:changes` ? `${repoRoot}:changes/${fileName}` : `${parentId}/${fileName}`;
        const change = cache.changesByRelativePath.get(relativePath);
        const fileItem = new GitHelperTreeItem(
            "changesFile",
            repoRoot,
            fileName,
            TreeItemCollapsibleState.None,
            fileId,
            undefined,
            undefined,
            {
                command: Commands.OpenChangesFile,
                title: "Open file diff",
                arguments: [repoRoot, cache.mergeBaseRef, relativePath],
            },
            cache.mergeBaseRef,
            relativePath,
            change
        );
        fileItem.resourceUri = Uri.file(path.join(repoRoot, relativePath));
        fileItem.contextValue = "changes-file";
        items.push(fileItem);
    }

    return items;
}

export async function openChangesFile(
    repoRoot: string,
    mergeBaseRef: string,
    relativePath: string,
    change: DiffChange | undefined
): Promise<void> {
    const { commands, window } = await import("vscode");
    if (!change) {
        await commands.executeCommand("vscode.open", Uri.file(path.join(repoRoot, relativePath)));
        return;
    }

    const { toMultiFileDiffEditorUris } = await import("../git/gitUri");
    const { originalUri, modifiedUri } = toMultiFileDiffEditorUris(change, mergeBaseRef, "HEAD");
    if (originalUri && modifiedUri) {
        await commands.executeCommand("vscode.diff", originalUri, modifiedUri, relativePath);
        return;
    }
    if (modifiedUri) {
        await commands.executeCommand("vscode.open", modifiedUri);
        return;
    }
    if (originalUri) {
        await window.showInformationMessage(`File deleted: ${relativePath}`);
    }
}
