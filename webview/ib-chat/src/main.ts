import type { ExtensionToWebviewMessage } from "../../../src/chat/protocol/ibChatProtocol";
import "./app.css";
import { createVsCodeIbChatHost } from "./host";

type InitPayload = Extract<ExtensionToWebviewMessage, { type: "init" }>;

function createTraceStep(primary: string, details?: string[]): HTMLElement {
    const step = document.createElement("div");
    step.className = "trace-step";
    const bullet = document.createElement("span");
    bullet.className = "trace-bullet";
    bullet.textContent = "\u25CF";
    bullet.setAttribute("aria-hidden", "true");
    const body = document.createElement("div");
    body.className = "trace-body";
    const line = document.createElement("div");
    line.className = "trace-line";
    line.textContent = primary;
    body.append(line);
    if (details !== undefined && details.length > 0) {
        const detailWrap = document.createElement("div");
        detailWrap.className = "trace-details";
        for (const detail of details) {
            const row = document.createElement("div");
            row.className = "trace-detail";
            row.textContent = detail;
            detailWrap.append(row);
        }
        body.append(detailWrap);
    }
    step.append(bullet, body);
    return step;
}

function buildDemoDiffBlock(): HTMLElement {
    const frame = document.createElement("div");
    frame.className = "diff-frame";
    const header = document.createElement("div");
    header.className = "diff-frame-header";
    header.textContent = "package.json -5";
    const pre = document.createElement("pre");
    pre.className = "diff-frame-body";
    const rows: { text: string; remove?: boolean }[] = [
        { text: '{ "commands": [' },
        { text: "    {" },
        { text: '-      "command": "ib-utilities.showIbChat",', remove: true },
        { text: '      "title": "Show IB Chat",' },
    ];
    for (const row of rows) {
        const span = document.createElement("span");
        span.style.display = "block";
        if (row.remove === true) {
            span.className = "diff-line-remove";
        }
        span.textContent = row.text;
        pre.append(span);
    }
    const footer = document.createElement("div");
    footer.className = "diff-frame-footer";
    footer.textContent = "... truncated (2 more lines) · ctrl+r to review";
    frame.append(header, pre, footer);
    return frame;
}

function mountShell(root: HTMLElement, init: InitPayload, post: (body: string) => void): void {
    root.replaceChildren();
    root.className = "root agent-root";

    const header = document.createElement("header");
    header.className = "agent-header";
    const titleLine = document.createElement("div");
    titleLine.className = "agent-title-line";
    const brand = document.createTextNode("IB Chat Agent ");
    const versionSpan = document.createElement("span");
    versionSpan.className = "agent-version";
    versionSpan.textContent = init.agentVersionLabel ?? "";
    titleLine.append(brand, versionSpan);
    const meta = document.createElement("div");
    meta.className = "agent-meta-line";
    const workspaceText =
        init.workspaceLabel !== undefined && init.workspaceLabel.length > 0
            ? init.workspaceLabel
            : "No workspace folder open";
    meta.textContent = workspaceText;
    meta.title = workspaceText;
    header.append(titleLine, meta);

    const userBar = document.createElement("section");
    userBar.className = "user-prompt-bar";
    userBar.setAttribute("aria-label", "User request");
    userBar.textContent =
        "Remove the show ib chat button in the view and remove the extra new ib chat keep the editor one";

    const trace = document.createElement("main");
    trace.className = "agent-trace";
    trace.setAttribute("role", "log");
    trace.setAttribute("aria-label", "Agent trace");

    trace.append(
        createTraceStep('Searching the codebase for "Show IB Chat" and related commands.'),
        createTraceStep("Grepped 2 greps", ['Grepped "Show IB Chat|showIbChat|show.*ib.*chat" in .']),
        createTraceStep("Read 2 files", ["Read src/chat/IbChatViewProvider.ts", "Read package.json lines 70-289"])
    );

    const summary = document.createElement("div");
    summary.className = "agent-summary";
    summary.textContent =
        'Removing the Chats view title entries for "Show IB Chat" and duplicate "New IB Chat" (addIbChatSession), keeping newIbChatEditor. Removing the unused commands and cleaning up the sessions view.';
    trace.append(summary, buildDemoDiffBlock());

    const composerFrame = document.createElement("footer");
    composerFrame.className = "composer-frame";
    const textarea = document.createElement("textarea");
    textarea.className = "composer-input";
    textarea.placeholder = "Describe a task or reply to the agent…";
    textarea.setAttribute("aria-label", "Agent input");
    textarea.rows = 2;
    const composerFooter = document.createElement("div");
    composerFooter.className = "composer-footer";
    const hint = document.createElement("span");
    hint.className = "composer-hint";
    hint.textContent = "Enter to send";
    const sendButton = document.createElement("button");
    sendButton.type = "button";
    sendButton.className = "composer-send";
    sendButton.textContent = "Send";

    const submitMessage = (): void => {
        const body = textarea.value.trim();
        if (body.length === 0) {
            return;
        }
        post(body);
        textarea.value = "";
    };

    sendButton.addEventListener("click", submitMessage);
    textarea.addEventListener("keydown", (event: KeyboardEvent) => {
        if (event.key === "Enter" && !event.shiftKey) {
            event.preventDefault();
            submitMessage();
        }
    });

    composerFooter.append(hint, sendButton);
    composerFrame.append(textarea, composerFooter);
    root.append(header, userBar, trace, composerFrame);
}

const mount = document.getElementById("root");
if (!mount) {
    throw new Error("Missing #root");
}

const host = createVsCodeIbChatHost();

host.onExtensionMessage((message: ExtensionToWebviewMessage) => {
    if (message.type === "init") {
        mountShell(mount, message, (body) => {
            host.post({ type: "send", body });
        });
    }
});

host.post({ type: "ready" });
