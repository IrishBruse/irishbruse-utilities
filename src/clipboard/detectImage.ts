import { platform } from "os";
import { asyncSpawn } from "../utils/asyncSpawn";

function mimeTypesIncludeImage(types: string): boolean {
    for (const line of types.split(/\r?\n/)) {
        for (const token of line.split(/\s+/)) {
            const mime = token.trim();
            if (mime.length !== 0 && mime.startsWith("image/")) {
                return true;
            }
        }
    }
    return false;
}

function macClipboardInfoHasImage(info: string): boolean {
    return /«class (PNGf|JPEG|GIFf|TIFF|PICT|BMPf)»/.test(info);
}

function isWayland(): boolean {
    const wayland = process.env.WAYLAND_DISPLAY;
    return (
        (wayland !== undefined && wayland.length > 0) ||
        process.env.XDG_SESSION_TYPE === "wayland"
    );
}

async function linuxWaylandClipboardHasImage(): Promise<boolean | null> {
    try {
        const { stdout, stderr, status } = await asyncSpawn("wl-paste", [
            "--list-types",
        ]);
        if (status !== 0) {
            return null;
        }
        return mimeTypesIncludeImage(stdout + stderr);
    } catch {
        return null;
    }
}

async function macClipboardHasImage(): Promise<boolean | null> {
    try {
        const { stdout, stderr, status } = await asyncSpawn("osascript", [
            "-e",
            "clipboard info",
        ]);
        if (status !== 0) {
            return null;
        }
        return macClipboardInfoHasImage(stdout + stderr);
    } catch {
        return null;
    }
}

/** On-demand clipboard image check. No background polling. */
export async function clipboardHasImage(): Promise<boolean | null> {
    const os = platform();
    if (os === "darwin") {
        return macClipboardHasImage();
    }
    if (os === "linux" && isWayland()) {
        return linuxWaylandClipboardHasImage();
    }
    return false;
}
