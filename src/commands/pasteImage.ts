import { ProgressLocation, Uri, window, workspace } from "vscode";
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

export async function pasteImage(selectedUri?: Uri) {}
