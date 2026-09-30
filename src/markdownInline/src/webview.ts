import { mountInlineEditor } from "./editor";

interface VsCodeApi {
    postMessage(message: unknown): void;
}

declare function acquireVsCodeApi(): VsCodeApi;

interface BootState {
    content: string;
    documentVersion: number;
    documentUrl: string;
    "readonly": boolean;
}

function isBootState(value: unknown): value is BootState {
    if (typeof value !== "object" || value === null) {
        return false;
    }
    const record = value as Record<string, unknown>;
    return typeof record.content === "string"
        && typeof record.documentVersion === "number"
        && typeof record.readonly === "boolean"
        && typeof record.documentUrl === "string";
}

function readBootState(): BootState {
    const meta = document.querySelector("#inline-md-state");
    if (!(meta instanceof HTMLMetaElement)) {
        throw new Error("Missing inline markdown state");
    }
    const parsed: unknown = JSON.parse(decodeURIComponent(meta.content));
    if (!isBootState(parsed)) {
        throw new Error("Invalid inline markdown state");
    }
    return parsed;
}

function readMessageSecret(): string {
    const meta = document.querySelector('meta[name="inline-md-message-secret"]');
    if (!(meta instanceof HTMLMetaElement) || meta.content.length === 0) {
        throw new Error("Missing inline markdown message secret");
    }
    return meta.content;
}

const vscode = acquireVsCodeApi();
const messageSecret = readMessageSecret();
const boot = readBootState();
const parent = document.querySelector("#editor");
if (!(parent instanceof HTMLElement)) {
    throw new Error("Missing #editor");
}

const editor = mountInlineEditor(parent, {
    text: boot.content,
    documentUrl: boot.documentUrl,
    readOnly: boot.readonly,
    onEdit(edit) {
        vscode.postMessage({
            type: "edit",
            messageSecret,
            start: edit.start,
            endExclusive: edit.endExclusive,
            text: edit.text,
        });
    },
    onHistory(command) {
        vscode.postMessage({
            type: "history",
            messageSecret,
            command,
        });
    },
    onLink(href) {
        vscode.postMessage({
            type: "openLink",
            messageSecret,
            href,
        });
    },
});

vscode.postMessage({
    type: "ready",
    messageSecret,
    documentVersion: boot.documentVersion,
});

window.addEventListener("message", (event: MessageEvent) => {
    const message: unknown = event.data;
    if (typeof message !== "object" || message === null) {
        return;
    }
    const record = message as Record<string, unknown>;
    if (record.messageSecret !== messageSecret) {
        return;
    }
    if (record.type === "update" && typeof record.content === "string") {
        editor.setDocument(record.content);
    }
});
