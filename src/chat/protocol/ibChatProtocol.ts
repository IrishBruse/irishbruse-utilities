/**
 * Messages sent from the IB Chat webview to the extension host.
 */
export type WebviewToExtensionMessage =
    | { type: "ready" }
    | { type: "send"; body: string };

/**
 * Messages sent from the extension host to the IB Chat webview.
 */
export type ExtensionToWebviewMessage = { type: "init"; sessionId: string; title: string };

/**
 * Parses an untrusted `postMessage` payload from the webview.
 */
export function tryParseWebviewMessage(raw: unknown): WebviewToExtensionMessage | null {
    if (raw === null || typeof raw !== "object") {
        return null;
    }
    const record = raw as Record<string, unknown>;
    const messageType = record.type;
    if (messageType === "ready") {
        return { type: "ready" };
    }
    if (messageType === "send" && typeof record.body === "string") {
        return { type: "send", body: record.body };
    }
    return null;
}
