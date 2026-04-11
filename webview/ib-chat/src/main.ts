import type {
    ExtensionToWebviewMessage,
    PlanEntry,
    ToolCallStatus,
} from "../../../src/chat/protocol/ibChatProtocol";
import "./app.css";
import { createVsCodeIbChatHost } from "./host";

type InitPayload = Extract<ExtensionToWebviewMessage, { type: "init" }>;

function createUserMessageBlock(text: string): HTMLElement {
    const bar = document.createElement("section");
    bar.className = "user-prompt-bar";
    bar.setAttribute("aria-label", "User message");
    bar.textContent = text;
    return bar;
}

function createAgentStreamBlock(): { wrap: HTMLElement; pre: HTMLPreElement } {
    const wrap = document.createElement("div");
    wrap.className = "agent-response-stream";
    const pre = document.createElement("pre");
    pre.className = "agent-response-text";
    pre.setAttribute("aria-label", "Agent response");
    wrap.append(pre);
    return { wrap, pre };
}

function createToolCallCard(
    toolCallId: string,
    title: string,
    kind: string | undefined,
    status: ToolCallStatus | undefined
): HTMLElement {
    const card = document.createElement("div");
    card.className = "tool-call-card";
    card.dataset.toolId = toolCallId;

    const head = document.createElement("div");
    head.className = "tool-call-head";

    const spinner = document.createElement("span");
    spinner.className = "tool-call-spinner";
    spinner.setAttribute("aria-hidden", "true");

    const titleEl = document.createElement("span");
    titleEl.className = "tool-call-title";
    titleEl.textContent = title;

    const kindEl = document.createElement("span");
    kindEl.className = "tool-call-kind";
    kindEl.textContent = kind ?? "";
    kindEl.hidden = kind === undefined || kind.length === 0;

    head.append(spinner, titleEl, kindEl);

    const detail = document.createElement("div");
    detail.className = "tool-call-detail";
    detail.hidden = true;

    card.append(head, detail);

    setToolCallStatus(card, status ?? "pending");
    return card;
}

function setToolCallStatus(card: HTMLElement, status: ToolCallStatus): void {
    card.dataset.status = status;
    const spinner = card.querySelector(".tool-call-spinner");
    if (spinner instanceof HTMLElement) {
        if (status === "in_progress" || status === "pending") {
            spinner.textContent = "\u25CC";
            spinner.className = "tool-call-spinner tool-call-spinner--running";
        } else if (status === "completed") {
            spinner.textContent = "\u2713";
            spinner.className = "tool-call-spinner tool-call-spinner--done";
        } else {
            spinner.textContent = "\u2715";
            spinner.className = "tool-call-spinner tool-call-spinner--failed";
        }
    }
}

function updateToolCallCard(card: HTMLElement, status: ToolCallStatus, content: string | undefined): void {
    setToolCallStatus(card, status);
    const detail = card.querySelector(".tool-call-detail");
    if (detail instanceof HTMLElement && content !== undefined && content.trim().length > 0) {
        detail.textContent = content;
        detail.hidden = false;
    }
}

function createPlanBlock(entries: PlanEntry[]): HTMLElement {
    const wrap = document.createElement("div");
    wrap.className = "agent-plan";
    wrap.setAttribute("aria-label", "Agent plan");
    const title = document.createElement("div");
    title.className = "agent-plan-title";
    title.textContent = "Plan";
    wrap.append(title);
    for (const e of entries) {
        const row = document.createElement("div");
        row.className = "agent-plan-row";
        const st = document.createElement("span");
        st.className = "agent-plan-status";
        st.textContent = e.status;
        const pr = document.createElement("span");
        pr.className = "agent-plan-content";
        pr.textContent = e.content;
        if (e.priority !== undefined) {
            row.title = `priority: ${e.priority}`;
        }
        row.append(st, pr);
        wrap.append(row);
    }
    return wrap;
}

type ExtensionMessageAfterInit = Exclude<ExtensionToWebviewMessage, { type: "init" }>;

type ChatView = {
    handleMessage(message: ExtensionMessageAfterInit): void;
};

function mountChatView(
    root: HTMLElement,
    init: InitPayload,
    postSend: (body: string) => void,
    postCancel: () => void
): ChatView {
    root.replaceChildren();
    root.className = "root agent-root";

    const header = document.createElement("header");
    header.className = "agent-header";
    const titleLine = document.createElement("div");
    titleLine.className = "agent-title-line";
    const brand = document.createTextNode("IB Chat ");
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
    if (init.acpAgentName !== undefined && init.acpAgentName.length > 0) {
        const agentLine = document.createElement("div");
        agentLine.className = "agent-acp-name";
        agentLine.textContent = `ACP agent: ${init.acpAgentName}`;
        header.append(agentLine);
    }

    const errorBanner = document.createElement("div");
    errorBanner.className = "ib-chat-error";
    errorBanner.setAttribute("role", "alert");
    errorBanner.hidden = true;

    const trace = document.createElement("main");
    trace.className = "agent-trace";
    trace.setAttribute("role", "log");
    trace.setAttribute("aria-label", "Conversation");

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
    hint.textContent = "Enter to send · Shift+Enter for newline";
    const cancelButton = document.createElement("button");
    cancelButton.type = "button";
    cancelButton.className = "composer-cancel";
    cancelButton.textContent = "Cancel";
    cancelButton.disabled = true;
    const sendButton = document.createElement("button");
    sendButton.type = "button";
    sendButton.className = "composer-send";
    sendButton.textContent = "Send";

    let promptInFlight = false;
    let agentTextPre: HTMLPreElement | null = null;
    const toolCards = new Map<string, HTMLElement>();

    function setBusy(busy: boolean): void {
        promptInFlight = busy;
        textarea.disabled = busy;
        sendButton.disabled = busy;
        cancelButton.disabled = !busy;
    }

    function closeAgentStream(): void {
        agentTextPre = null;
    }

    function appendToTrace(el: HTMLElement): void {
        trace.append(el);
        trace.scrollTop = trace.scrollHeight;
    }

    function getOrCreateAgentStream(): HTMLPreElement {
        if (agentTextPre !== null) {
            return agentTextPre;
        }
        const { wrap, pre } = createAgentStreamBlock();
        agentTextPre = pre;
        appendToTrace(wrap);
        return pre;
    }

    const submitMessage = (): void => {
        if (promptInFlight) {
            return;
        }
        const body = textarea.value.trim();
        if (body.length === 0) {
            return;
        }
        appendToTrace(createUserMessageBlock(body));
        textarea.value = "";
        postSend(body);
        setBusy(true);
        errorBanner.hidden = true;
        closeAgentStream();
        toolCards.clear();
    };

    cancelButton.addEventListener("click", () => {
        postCancel();
    });

    sendButton.addEventListener("click", submitMessage);
    textarea.addEventListener("keydown", (event: KeyboardEvent) => {
        if (event.key === "Enter" && !event.shiftKey) {
            event.preventDefault();
            submitMessage();
        }
    });

    composerFooter.append(hint, cancelButton, sendButton);
    composerFrame.append(textarea, composerFooter);
    root.append(header, errorBanner, trace, composerFrame);

    function handleMessage(message: ExtensionMessageAfterInit): void {
        switch (message.type) {
            case "appendAgentText": {
                const pre = getOrCreateAgentStream();
                pre.textContent += message.text;
                trace.scrollTop = trace.scrollHeight;
                break;
            }
            case "appendToolCall": {
                closeAgentStream();
                const card = createToolCallCard(
                    message.toolCallId,
                    message.title,
                    message.kind,
                    message.status
                );
                toolCards.set(message.toolCallId, card);
                appendToTrace(card);
                break;
            }
            case "updateToolCall": {
                const card = toolCards.get(message.toolCallId);
                if (card) {
                    updateToolCallCard(card, message.status, message.content);
                } else {
                    const orphan = createToolCallCard(message.toolCallId, "Tool", undefined, message.status);
                    updateToolCallCard(orphan, message.status, message.content);
                    toolCards.set(message.toolCallId, orphan);
                    closeAgentStream();
                    appendToTrace(orphan);
                }
                trace.scrollTop = trace.scrollHeight;
                break;
            }
            case "appendPlan": {
                closeAgentStream();
                appendToTrace(createPlanBlock(message.entries));
                break;
            }
            case "turnComplete": {
                closeAgentStream();
                setBusy(false);
                break;
            }
            case "error": {
                closeAgentStream();
                errorBanner.textContent = message.message;
                errorBanner.hidden = false;
                setBusy(false);
                break;
            }
        }
    }

    return { handleMessage };
}

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
