import { commands, env, FileType, Uri, window, workspace, type FileStat } from "vscode";
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

export async function pasteImage(selectedUri?: Uri) {
    const tempFile = path.join(os.tmpdir(), "paste-image-temp.png");
    const clipboardCommand = getClipboardCommand(tempFile);

    try {
        await execAsync(clipboardCommand);
    } catch {
        if (fs.existsSync(tempFile)) {
            fs.unlinkSync(tempFile);
        }
        return;
    }

    if (!fs.existsSync(tempFile) || fs.statSync(tempFile).size === 0) {
        if (fs.existsSync(tempFile)) {
            fs.unlinkSync(tempFile);
        }
        return;
    }

    let targetDir = await resolveTargetDirectory(selectedUri);

    if (!targetDir) {
        const activeEditor = window.activeTextEditor;
        if (activeEditor) {
            targetDir = path.dirname(activeEditor.document.uri.fsPath);
        } else {
            const workspaceFolder = workspace.workspaceFolders?.[0];
            if (!workspaceFolder) {
                if (fs.existsSync(tempFile)) {
                    fs.unlinkSync(tempFile);
                }
                return;
            }
            targetDir = workspaceFolder.uri.fsPath;
        }
    }

    try {
        const imageName = generateImageName();
        const destPath = path.join(targetDir, imageName);

        fs.copyFileSync(tempFile, destPath);
        fs.unlinkSync(tempFile);

        const workspaceFolder = workspace.getWorkspaceFolder(Uri.file(targetDir));
        if (!workspaceFolder) {
            throw new Error("Could not determine workspace folder");
        }

        const relativePath = path.relative(workspaceFolder.uri.fsPath, destPath);
        await env.clipboard.writeText(`@${relativePath}`);
    } catch {
        if (fs.existsSync(tempFile)) {
            fs.unlinkSync(tempFile);
        }
    }
}
