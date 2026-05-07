import path from "path";
import { env, SourceControl, Uri, window, workspace } from "vscode";
import { asyncSpawn, Process } from "../utils/asyncSpawn";

/**
 * Resolves the git repository root from SCM context, the active editor, or workspace folders.
 */
async function resolveRepositoryPath(sourceControl?: SourceControl): Promise<string | undefined> {
    if (sourceControl?.rootUri) {
        return sourceControl.rootUri.fsPath;
    }

    const gitToplevelFrom = async (cwd: string): Promise<string | undefined> => {
        try {
            const result = await asyncSpawn("git", ["rev-parse", "--show-toplevel"], { cwd });
            if (result.status === 0) {
                return result.stdout.trim();
            }
        } catch {
            return undefined;
        }
        return undefined;
    };

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

export async function openPR(sourceControl?: SourceControl): Promise<void> {
    const repoPath = await resolveRepositoryPath(sourceControl);
    if (!repoPath) {
        window.showWarningMessage("Could not determine repository path.");
        return;
    }

    let commands: Process[] = [];

    try {
        commands = await Promise.all([
            asyncSpawn("gh", ["pr", "view", "--json", "number", "--jq", ".number"], { cwd: repoPath }),
            asyncSpawn("git", ["remote", "get-url", "origin"], { cwd: repoPath }),
        ]);
    } catch (error) {
        window.showErrorMessage("Failed to run git commands ", (error as Error).message);
        return;
    }

    const prNumber = commands[0].stdout.trim();
    const remoteUrl = commands[1].stdout.trim().replace(".git", "");

    let prUrl = `${remoteUrl}/pull/${prNumber}`;
    if (commands[0].status !== 0) {
        env.openExternal(Uri.parse(remoteUrl));
        return;
    }

    env.openExternal(Uri.parse(prUrl));
}
