import type { ExtensionToWebviewMessage } from "../../../src/chat/protocol/ibChatProtocol";
import "./app.css";
import { createVsCodeIbChatHost } from "./host";

function mountShell(root: HTMLElement, post: (body: string) => void): void {
    root.innerHTML = "";
    root.className = "root";

    const messages = document.createElement("div");
    messages.className = "messages";
    messages.setAttribute("role", "log");
    messages.setAttribute("aria-label", "Messages");

    const assistantBubble = document.createElement("div");
    assistantBubble.className = "bubble assistant";
    const assistantLabel = document.createElement("div");
    assistantLabel.className = "label";
    assistantLabel.textContent = "Assistant";
    const assistantBody = document.createElement("div");
    assistantBody.textContent = "This is a placeholder message. Chat will connect here later.";
    assistantBubble.append(assistantLabel, assistantBody);

    const userBubble = document.createElement("div");
    userBubble.className = "bubble user";
    const userLabel = document.createElement("div");
    userLabel.className = "label";
    userLabel.textContent = "You";
    const userBody = document.createElement("div");
    userBody.textContent = "Example user message.";
    userBubble.append(userLabel, userBody);

    messages.append(assistantBubble, userBubble);

    const composer = document.createElement("div");
    composer.className = "composer";
    const textarea = document.createElement("textarea");
    textarea.placeholder = "Type a message...";
    textarea.setAttribute("aria-label", "Message input");
    const sendButton = document.createElement("button");
    sendButton.type = "button";
    sendButton.textContent = "Send";

    sendButton.addEventListener("click", () => {
        const body = textarea.value.trim();
        if (body.length === 0) {
            return;
        }
        post(body);
        textarea.value = "";
    });

    composer.append(textarea, sendButton);
    root.append(messages, composer);
}

const mount = document.getElementById("root");
if (!mount) {
    throw new Error("Missing #root");
}

const host = createVsCodeIbChatHost();

host.onExtensionMessage((message: ExtensionToWebviewMessage) => {
    if (message.type === "init") {
        mountShell(mount, (body) => {
            host.post({ type: "send", body });
        });
    }
});

host.post({ type: "ready" });
