import {
    commands,
    env,
    FileType,
    Uri,
    window,
    workspace,
    type FileStat,
} from "vscode";
import { exec } from "child_process";
import path from "path";
import fs from "fs";
import os from "os";

function getClipboardCommand(tempFile: string): string {
    const platform = os.platform();

    if (platform === "darwin") {
        return `pngpaste "${tempFile}"`;
    }

    if (platform === "linux") {
        if (process.env.WAYLAND_DISPLAY) {
            return `wl-paste --type image/png > "${tempFile}"`;
        }
        if (process.env.DISPLAY) {
            return `xclip -selection clipboard -t image/png -o > "${tempFile}"`;
        }
    }

    throw new Error("Unsupported platform");
}

function execAsync(command: string): Promise<void> {
    return new Promise<void>((resolve, reject) => {
        exec(command, (error) => {
            if (error) {
                reject(error);
            } else {
                resolve();
            }
        });
    });
}

function generateImageName(): string {
    const now = new Date();
    const timestamp = now.toISOString().replace(/[-:T]/g, "").slice(0, 14);
    return `image_${timestamp}.png`;
}

function targetDirectoryForResource(resourceUri: Uri, stat: FileStat): string {
    if ((stat.type & FileType.Directory) === FileType.Directory) {
        return resourceUri.fsPath;
    }
    return path.dirname(resourceUri.fsPath);
}

async function resolveTargetDirectory(selectedUri: Uri | undefined): Promise<string | undefined> {
    if (selectedUri) {
        const stat = await workspace.fs.stat(selectedUri);
        return targetDirectoryForResource(selectedUri, stat);
    }
    try {
        await commands.executeCommand("copyFilePath");
    } catch {
        return undefined;
    }
    const text = (await env.clipboard.readText()).trim();
    if (!text) {
        return undefined;
    }
    const firstLine = text.split(/\r?\n/)[0];
    const firstPath = firstLine?.trim();
    if (!firstPath) {
        return undefined;
    }
    const resourceUri = Uri.file(firstPath);
    try {
        const stat = await workspace.fs.stat(resourceUri);
        return targetDirectoryForResource(resourceUri, stat);
    } catch {
        return undefined;
    }
}

const tempBasename = "paste-image-temp.png";

/**
 * Writes clipboard image bytes to a PNG file under the system temp directory, or returns undefined if none.
 */
export async function tryCaptureClipboardImageAsTempFile(): Promise<string | undefined> {
    const tempFile = path.join(os.tmpdir(), tempBasename);
    let clipboardCommand: string;
    try {
        clipboardCommand = getClipboardCommand(tempFile);
    } catch {
        return undefined;
    }

    try {
        await execAsync(clipboardCommand);
    } catch {
        if (fs.existsSync(tempFile)) {
            fs.unlinkSync(tempFile);
        }
        return undefined;
    }

    if (!fs.existsSync(tempFile) || fs.statSync(tempFile).size === 0) {
        if (fs.existsSync(tempFile)) {
            fs.unlinkSync(tempFile);
        }
        return undefined;
    }

    return tempFile;
}

/**
 * Saves a PNG from a temp path into the workspace and writes `@relativePath` to the clipboard.
 * @param pasteContext When `explorer`, an empty explorer selection uses the first workspace folder root instead of the active editor path.
 */
export async function finalizePasteImageFromTempFile(
    tempFile: string,
    selectedUri: Uri | undefined,
    pasteContext: "explorer" | "editor" = "editor"
): Promise<boolean> {
    let targetDir = await resolveTargetDirectory(selectedUri);

    if (!targetDir) {
        if (pasteContext === "explorer") {
            const workspaceFolder = workspace.workspaceFolders?.[0];
            if (!workspaceFolder) {
                return false;
            }
            targetDir = workspaceFolder.uri.fsPath;
        } else {
            const activeEditor = window.activeTextEditor;
            if (activeEditor) {
                targetDir = path.dirname(activeEditor.document.uri.fsPath);
            } else {
                const workspaceFolder = workspace.workspaceFolders?.[0];
                if (!workspaceFolder) {
                    return false;
                }
                targetDir = workspaceFolder.uri.fsPath;
            }
        }
    }

    try {
        const imageName = generateImageName();
        const destPath = path.join(targetDir, imageName);

        fs.copyFileSync(tempFile, destPath);

        const workspaceFolder = workspace.getWorkspaceFolder(Uri.file(targetDir));
        if (!workspaceFolder) {
            return false;
        }

        const relativePath = path.relative(workspaceFolder.uri.fsPath, destPath);
        await env.clipboard.writeText(`@${relativePath}`);
        return true;
    } catch {
        return false;
    }
}

/**
 * Pastes a clipboard image into the workspace when present; otherwise runs the built-in paste for the given surface.
 */
export async function smartPaste(
    fallback: "editor" | "explorer" | undefined,
    selectedUri?: Uri
): Promise<void> {
    const tempFile = await tryCaptureClipboardImageAsTempFile();
    if (tempFile) {
        let saved = false;
        try {
            saved = await finalizePasteImageFromTempFile(
                tempFile,
                selectedUri,
                fallback === "explorer" ? "explorer" : "editor"
            );
        } finally {
            if (fs.existsSync(tempFile)) {
                fs.unlinkSync(tempFile);
            }
        }
        if (saved) {
            return;
        }
    }

    if (fallback === "explorer") {
        await commands.executeCommand("filesExplorer.paste");
        return;
    }

    await commands.executeCommand("editor.action.clipboardPasteAction");
}

export async function pasteImage(selectedUri?: Uri) {
    const tempFile = await tryCaptureClipboardImageAsTempFile();
    if (!tempFile) {
        return;
    }

    try {
        await finalizePasteImageFromTempFile(tempFile, selectedUri, "explorer");
    } finally {
        if (fs.existsSync(tempFile)) {
            fs.unlinkSync(tempFile);
        }
    }
}
