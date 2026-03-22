import { ProgressLocation, Uri, window, workspace } from "vscode";
import { exec } from "child_process";
import path from "path";
import fs from "fs";
import os from "os";
import { Configuration } from "../constants";

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

export async function pasteImage() {
    const workspaceFolders = workspace.workspaceFolders;

    if (!workspaceFolders || workspaceFolders.length === 0) {
        window.showWarningMessage("No workspace folder open");
        return;
    }

    const config = workspace.getConfiguration().get<string>(Configuration.PasteImagePath, "images");
    const workspaceRoot = workspaceFolders[0].uri;
    const imagesFolderUri = Uri.joinPath(workspaceRoot, config);

    await workspace.fs.createDirectory(imagesFolderUri);

    const dateStr = new Date().toISOString().slice(0, 16).replace(/[T:]/g, "-");
    const tempFile = path.join(os.tmpdir(), `${dateStr}.png`);

    try {
        const command = getClipboardCommand(tempFile);
        await new Promise<void>((resolve, reject) => {
            exec(command, (error) => {
                if (error) {
                    reject(error);
                } else {
                    resolve();
                }
            });
        });
    } catch {
        const platform = os.platform();
        let hint = "";
        if (platform === "darwin") {
            hint = " Install pngpaste: brew install pngpaste";
        } else if (process.env.WAYLAND_DISPLAY) {
            hint = " Install wl-clipboard: sudo apt install wl-clipboard";
        } else if (process.env.DISPLAY) {
            hint = " Install xclip: sudo apt install xclip";
        }

        window.showWarningMessage(`Failed to read clipboard image.${hint}`);
        return;
    }

    let stats: fs.Stats;
    try {
        stats = fs.statSync(tempFile);
    } catch {
        window.showWarningMessage("No image in clipboard");
        return;
    }

    if (stats.size === 0) {
        fs.unlinkSync(tempFile);
        window.showWarningMessage("No image in clipboard");
        return;
    }

    const fileName = `image-${dateStr}.png`;
    const fileUri = Uri.joinPath(imagesFolderUri, fileName);

    fs.copyFileSync(tempFile, fileUri.fsPath);
    fs.unlinkSync(tempFile);

    const relativePath = path.relative(workspaceRoot.fsPath, fileUri.fsPath);
    const output = `@${relativePath.replace(/\\/g, "/")}`;

    pasteTerminalText(output);
}

async function pasteTerminalText(output: string) {
    const terminal = window.terminals[0];
    if (terminal) {
        await new Promise((resolve) => setTimeout(resolve, 1000));
        terminal.sendText(output, false);
    } else {
        await window.withProgress(
            {
                location: ProgressLocation.Notification,
                title: "Image pasted",
            },
            async (progress) => {
                progress.report({ message: output });
            }
        );
    }
}
