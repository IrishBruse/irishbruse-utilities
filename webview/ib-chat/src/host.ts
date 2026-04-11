import type { ExtensionToWebviewMessage, WebviewToExtensionMessage } from "../../../src/chat/protocol/ibChatProtocol";

declare function acquireVsCodeApi(): {
    postMessage(message: unknown): void;
};

/**
 * VS Code webview bridge. A standalone app can replace this with fetch, WebSocket, or another transport.
 */
export function createVsCodeIbChatHost(): {
    post(message: WebviewToExtensionMessage): void;
    onExtensionMessage(handler: (message: ExtensionToWebviewMessage) => void): void;
} {
    const vscode = acquireVsCodeApi();
    return {
        post(message: WebviewToExtensionMessage): void {
            vscode.postMessage(message);
        },
        onExtensionMessage(handler: (message: ExtensionToWebviewMessage) => void): void {
            window.addEventListener("message", (event: MessageEvent<ExtensionToWebviewMessage>) => {
                handler(event.data);
            });
        },
    };
}
