import path from "path";
import { SourceControl, window, workspace } from "vscode";
import { asyncSpawn } from "../utils/asyncSpawn";

async function gitToplevelFrom(cwd: string): Promise<string | undefined> {
    try {
        const result = await asyncSpawn("git", ["rev-parse", "--show-toplevel"], { cwd });
        if (result.status === 0) {
            return result.stdout.trim();
        }
    } catch {
        return undefined;
    }
    return undefined;
}

/**
 * Resolves the git repository root from SCM context, the active editor, or workspace folders.
 */
export async function resolveRepositoryPath(sourceControl?: SourceControl): Promise<string | undefined> {
    if (sourceControl?.rootUri) {
        return sourceControl.rootUri.fsPath;
    }

    const editorUri = window.activeTextEditor?.document.uri;
    if (editorUri?.scheme === "file") {
        const workspaceFolder = workspace.getWorkspaceFolder(editorUri);
        const cwd = workspaceFolder?.uri.fsPath ?? path.dirname(editorUri.fsPath);
        const fromEditor = await gitToplevelFrom(cwd);
        if (fromEditor) {
            return fromEditor;
        }
    }

    const folders = workspace.workspaceFolders;
    if (!folders?.length) {
        return undefined;
    }

    for (const folder of folders) {
        const fromFolder = await gitToplevelFrom(folder.uri.fsPath);
        if (fromFolder) {
            return fromFolder;
        }
    }

    return undefined;
}
