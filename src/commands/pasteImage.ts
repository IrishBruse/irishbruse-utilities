import { env, ProgressLocation, Uri, window, workspace } from "vscode";
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

export async function pasteImage(selectedUri?: Uri) {
    let targetDir: string;

    if (selectedUri) {
        const stat = await workspace.fs.stat(selectedUri);
        if (stat.type === 1) {
            targetDir = path.dirname(selectedUri.fsPath);
        } else {
            targetDir = selectedUri.fsPath;
        }
    } else {
        const workspaceFolder = workspace.workspaceFolders?.[0];
        if (!workspaceFolder) {
            window.showErrorMessage("No workspace folder open");
            return;
        }
        targetDir = workspaceFolder.uri.fsPath;
    }

    const tempFile = path.join(os.tmpdir(), "paste-image-temp.png");
    const command = getClipboardCommand(tempFile);

    try {
        await execAsync(command);
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

    try {
        await window.withProgress({ location: ProgressLocation.Notification, title: "Pasting image..." }, async () => {
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

            window.showInformationMessage(`Image saved and path copied: @${relativePath}`);
        });
    } catch (error) {
        if (fs.existsSync(tempFile)) {
            fs.unlinkSync(tempFile);
        }
        window.showErrorMessage(`Failed to paste image: ${error}`);
    }
}
