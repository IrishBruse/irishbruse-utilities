import { platform } from "os";
import { commands, window } from "vscode";
import { asyncSpawn } from "../utils/asyncSpawn";

/**
 * Parses `wl-paste --list-types` stdout for any image MIME type.
 */
export function waylandTypesIndicateImage(stdout: string): boolean {
    for (const line of stdout.split(/\r?\n/)) {
        for (const part of line.split(/\s+/)) {
            const trimmed = part.trim();
            if (trimmed.length === 0) {
                continue;
            }
            if (trimmed.startsWith("image/")) {
                return true;
            }
        }
    }
    return false;
}

/**
 * Parses macOS `osascript` output of `clipboard info` for known picture type class codes.
 */
export function macClipboardInfoIndicatesImage(text: string): boolean {
    return /«class (PNGf|JPEG|GIFf|TIFF|PICT|BMPf)»/.test(text);
}

/**
 * True when the extension host appears to be on Linux under a Wayland session.
 */
export function isLinuxWayland(): boolean {
    const waylandDisplay = process.env.WAYLAND_DISPLAY;
    if (waylandDisplay !== undefined && waylandDisplay.length > 0) {
        return true;
    }
    return process.env.XDG_SESSION_TYPE === "wayland";
}

async function detectMacClipboardImage(): Promise<boolean | null> {
    try {
        const { stdout, stderr, status } = await asyncSpawn("osascript", ["-e", "clipboard info"]);
        if (status !== 0) {
            return null;
        }
        return macClipboardInfoIndicatesImage(stdout + stderr);
    } catch {
        return null;
    }
}

async function detectWaylandClipboardImage(): Promise<boolean | null> {
    try {
        const { stdout, stderr, status } = await asyncSpawn("wl-paste", ["--list-types"]);
        if (status !== 0) {
            return null;
        }
        return waylandTypesIndicateImage(stdout + stderr);
    } catch {
        return null;
    }
}

/**
 * `when` clause key for keybindings (updated by the extension when the clipboard may have changed).
 */
export const clipboardHasImageWhenContext = "ib-utilities.clipboardHasImage";

/**
 * Publishes whether the clipboard currently contains an image (false when unsupported or read fails).
 */
export async function publishClipboardHasImageContext(value: boolean): Promise<void> {
    await commands.executeCommand("setContext", clipboardHasImageWhenContext, value);
}

/**
 * Probes the system clipboard for image data (macOS and Linux Wayland only, otherwise false).
 */
export async function probeClipboardContainsImage(): Promise<boolean> {
    const osName = platform();
    if (osName === "darwin") {
        const result = await detectMacClipboardImage();
        return result === true;
    }
    if (osName === "linux" && isLinuxWayland()) {
        const result = await detectWaylandClipboardImage();
        return result === true;
    }
    return false;
}

/**
 * Reports whether the system clipboard currently holds image data (macOS or Linux Wayland).
 */
export async function clipboardHasImage(): Promise<void> {
    const osName = platform();
    if (osName === "darwin") {
        const hasImage = await detectMacClipboardImage();
        await publishClipboardHasImageContext(hasImage === true);
        if (hasImage === null) {
            void window.showErrorMessage("Could not read the clipboard (osascript failed or is unavailable)");
            return;
        }
        void window.showInformationMessage(
            hasImage ? "The clipboard contains an image" : "The clipboard does not contain an image"
        );
        return;
    }
    if (osName === "linux") {
        if (!isLinuxWayland()) {
            await publishClipboardHasImageContext(false);
            void window.showWarningMessage("Clipboard image detection on Linux is only supported on Wayland");
            return;
        }
        const hasImage = await detectWaylandClipboardImage();
        await publishClipboardHasImageContext(hasImage === true);
        if (hasImage === null) {
            void window.showErrorMessage(
                "Could not read clipboard MIME types. Install wl-clipboard and ensure wl-paste is on PATH"
            );
            return;
        }
        void window.showInformationMessage(
            hasImage ? "The clipboard contains an image" : "The clipboard does not contain an image"
        );
        return;
    }
    await publishClipboardHasImageContext(false);
    void window.showWarningMessage("Clipboard image detection is supported on macOS and Linux Wayland only");
}
