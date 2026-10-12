import { Uri } from "vscode";

export let UserPath: string = null!;
export let SnippetsPath: string = null!;

export function setStoragePaths(globalStorageUri: Uri): void {
    const userFolderUri = Uri.joinPath(globalStorageUri, "../..");
    UserPath = userFolderUri.fsPath;
    SnippetsPath = Uri.joinPath(userFolderUri, "snippets").fsPath;
}
