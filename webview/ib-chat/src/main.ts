import type { ExtensionToWebviewMessage } from "../../../src/chat/protocol/ibChatProtocol";
import "./app.css";
import { createVsCodeIbChatHost } from "./host";
import { mountChatView, type ChatView } from "./ui";

const mount = document.getElementById("root");
if (!mount) {
    throw new Error("Missing #root");
}

const host = createVsCodeIbChatHost();
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
