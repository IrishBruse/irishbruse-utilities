import type {
    ExtensionToWebviewMessage,
    WebviewToExtensionMessage,
} from "../../../src/chat/protocol/ibChatProtocol";
import "virtual:ib-chat-theme.css";
import "../../ib-chat/src/app.css";
import { mountChatView, type ChatView } from "../../ib-chat/src/ui";

const WS_URL = `ws://${location.host}/__ib_chat_ws`;

function createWebSocketHost(): {
    post(message: WebviewToExtensionMessage): void;
    onExtensionMessage(handler: (message: ExtensionToWebviewMessage) => void): void;
} {
    const ws = new WebSocket(WS_URL);
    const pending: WebviewToExtensionMessage[] = [];
    let handler: ((message: ExtensionToWebviewMessage) => void) | null = null;

    ws.addEventListener("open", () => {
        for (const msg of pending) {
            ws.send(JSON.stringify(msg));
        }
        pending.length = 0;
    });

    ws.addEventListener("message", (event: MessageEvent<string>) => {
        const parsed = JSON.parse(event.data) as ExtensionToWebviewMessage;
        handler?.(parsed);
    });

    ws.addEventListener("close", () => {
        handler?.({ type: "error", message: "WebSocket connection closed." });
    });

    ws.addEventListener("error", () => {
        handler?.({ type: "error", message: "WebSocket connection error." });
    });

    return {
        post(message: WebviewToExtensionMessage): void {
            if (ws.readyState === WebSocket.OPEN) {
                ws.send(JSON.stringify(message));
            } else {
                pending.push(message);
            }
        },
        onExtensionMessage(h: (message: ExtensionToWebviewMessage) => void): void {
            handler = h;
        },
    };
}

const mount = document.getElementById("root");
if (!mount) {
    throw new Error("Missing #root");
}

const host = createWebSocketHost();
let view: ChatView | null = null;

host.onExtensionMessage((message: ExtensionToWebviewMessage) => {
    if (message.type === "init") {
        view = mountChatView(mount, message, (body) => {
            host.post({ type: "send", body });
        }, () => {
            host.post({ type: "cancel" });
        });
        return;
    }
    view?.handleMessage(message);
});

host.post({ type: "ready" });
