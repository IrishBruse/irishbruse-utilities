import { ExtensionContext, window, workspace } from "vscode";
import { probeClipboardContainsImage, publishClipboardHasImageContext } from "./commands/clipboardHasImage";

const clipboardContextDebounceMs = 50;
const clipboardContextPollMsSlow = 400;
const clipboardContextPollMsFast = 80;
const documentChangeDebounceMs = 80;

/**
 * Keeps `ib-utilities.clipboardHasImage` in sync with the OS clipboard.
 */
export function registerClipboardContextSync(context: ExtensionContext): void {
    let clipboardContextTimer: ReturnType<typeof setTimeout> | undefined;
    let documentChangeTimer: ReturnType<typeof setTimeout> | undefined;
    let pollTimer: ReturnType<typeof setInterval> | undefined;
    let lastPublished: boolean | undefined;
    let tail: Promise<void> = Promise.resolve();
    let pollMode: "fast" | "slow" | undefined;

    const restartAdaptivePoll = (): void => {
        const fast = lastPublished === true;
        const mode: "fast" | "slow" = fast ? "fast" : "slow";
        if (mode === pollMode && pollTimer !== undefined) {
            return;
        }
        pollMode = mode;
        if (pollTimer !== undefined) {
            clearInterval(pollTimer);
            pollTimer = undefined;
        }
        const intervalMs = fast ? clipboardContextPollMsFast : clipboardContextPollMsSlow;
        pollTimer = setInterval(() => {
            if (!window.state.focused) {
                return;
            }
            enqueueFlush("poll");
        }, intervalMs);
    };

    const flush = async (reason: string): Promise<void> => {
        void reason;
        const present = await probeClipboardContainsImage();
        lastPublished = present;
        await publishClipboardHasImageContext(present);
        restartAdaptivePoll();
    };

    const enqueueFlush = (reason: string): void => {
        tail = tail
            .then(async () => {
                await flush(reason);
            })
            .catch(() => {});
    };

    const scheduleFlush = (reason: string): void => {
        if (clipboardContextTimer !== undefined) {
            clearTimeout(clipboardContextTimer);
        }
        clipboardContextTimer = setTimeout(() => {
            clipboardContextTimer = undefined;
            enqueueFlush(reason);
        }, clipboardContextDebounceMs);
    };

    enqueueFlush("initial");

    context.subscriptions.push(
        window.onDidChangeWindowState((e) => {
            if (e.focused) {
                scheduleFlush("window-focus");
            }
        }),
        window.onDidChangeActiveTextEditor(() => {
            scheduleFlush("active-editor");
        }),
        workspace.onDidChangeTextDocument((e) => {
            const editor = window.activeTextEditor;
            if (editor === undefined || e.document !== editor.document) {
                return;
            }
            if (e.contentChanges.length === 0) {
                return;
            }
            if (documentChangeTimer !== undefined) {
                clearTimeout(documentChangeTimer);
            }
            documentChangeTimer = setTimeout(() => {
                documentChangeTimer = undefined;
                enqueueFlush("document-change");
            }, documentChangeDebounceMs);
        }),
        {
            dispose: () => {
                if (clipboardContextTimer !== undefined) {
                    clearTimeout(clipboardContextTimer);
                }
                if (documentChangeTimer !== undefined) {
                    clearTimeout(documentChangeTimer);
                }
                if (pollTimer !== undefined) {
                    clearInterval(pollTimer);
                }
            },
        }
    );
}

/**
 * Clears clipboard context on extension deactivate.
 */
export async function resetClipboardContextForShutdown(): Promise<void> {
    await publishClipboardHasImageContext(false);
}
