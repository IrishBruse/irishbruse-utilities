import type { ExtensionToWebviewMessage } from "../../../src/chat/protocol/ibChatProtocol";
import "./global.css";
import "./boot.css";
import { createVsCodeIbChatHost } from "./host";
import { mountChatView, type ChatView, type InitPayload } from "./ui";

function isInitPayload(message: ExtensionToWebviewMessage): message is InitPayload {
    return message.type === "init";
}

const mount = document.getElementById("root");
if (!mount) {
    throw new Error("Missing #root");
}

mount.className = "root agent-root";
mount.replaceChildren();
const bootLine = document.createElement("div");
bootLine.className = "ib-chat-boot";
bootLine.textContent = "Connecting…";
mount.appendChild(bootLine);

const host = createVsCodeIbChatHost();
let view: ChatView | null = null;
let initReceived = false;

host.onExtensionMessage((message: ExtensionToWebviewMessage) => {
    if (isInitPayload(message)) {
        if (view !== null) {
            return;
        }
        initReceived = true;
        clearTimeout(initRetryTimer);
        view = mountChatView(
            mount,
            message,
            (body) => {
                host.post({ type: "send", body });
            },
            () => {
                host.post({ type: "cancel" });
            },
            (agentName) => {
                host.post({ type: "setSessionAgent", agentName });
            },
            (modelId) => {
                host.post({ type: "setSessionModel", modelId });
            },
            (entries) => {
                host.post({ type: "savePromptHistory", entries });
            },
            (payload) => {
                host.post({ type: "permissionResponse", ...payload });
            }
        );
        return;
    }
    view?.handleMessage(message);
});

host.post({ type: "ready" });
const initRetryTimer = window.setTimeout(() => {
    if (!initReceived) {
        host.post({ type: "ready" });
    }
}, 750);
