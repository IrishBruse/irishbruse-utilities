import {
    Fragment,
    useLayoutEffect,
    useReducer,
    useRef,
    useState,
    type KeyboardEvent,
    type ReactElement,
    type RefObject,
} from "react";
import type { PlanEntry, ToolCallStatus } from "../../../src/chat/protocol/ibChatProtocol";
import {
    chatReducer,
    createInitialChatState,
    type ChatAction,
    type ExtensionMessageAfterInit,
    type InitPayload,
    type TraceItem,
    type TraceToolItem,
} from "./chatReducer";

function terminalStatusGlyph(status: ToolCallStatus): string {
    if (status === "in_progress" || status === "pending") {
        return "\u25CF";
    }
    if (status === "completed") {
        return "\u2713";
    }
    return "\u2715";
}

/**
 * Renders a tool invocation as a compact integrated-terminal style block (prompt line + optional output).
 */
function ToolCallBlock({ item }: { item: TraceToolItem }): ReactElement {
    const glyph = terminalStatusGlyph(item.status);
    const kindHidden = item.kind === undefined || item.kind.length === 0;
    const showOutput =
        item.detailVisible && item.content !== undefined && item.content.trim().length > 0;
    const subtitle =
        item.subtitle !== undefined && item.subtitle.trim().length > 0 ? item.subtitle.trim() : null;
    return (
        <div
            className="tool-call-terminal"
            data-tool-id={item.toolCallId}
            data-status={item.status}
            role="status"
            aria-label="Tool use"
        >
            <div className="tool-call-terminal-line">
                <span className="tool-call-terminal-prompt" aria-hidden="true">
                    $
                </span>
                <span className="tool-call-terminal-glyph" aria-hidden="true">
                    {glyph}
                </span>
                <span className="tool-call-terminal-title">{item.title}</span>
                {kindHidden ? null : <span className="tool-call-terminal-kind">[{item.kind}]</span>}
            </div>
            {subtitle !== null ? <div className="tool-call-terminal-subtitle">{subtitle}</div> : null}
            {showOutput ? <pre className="tool-call-terminal-pre">{item.content}</pre> : null}
        </div>
    );
}

function PlanBlock({ entries }: { entries: PlanEntry[] }): ReactElement {
    return (
        <div className="agent-plan" aria-label="Agent plan">
            <div className="agent-plan-title">Plan</div>
            {entries.map((e, i) => (
                <div
                    key={i}
                    className="agent-plan-row"
                    title={e.priority !== undefined ? `priority: ${e.priority}` : undefined}
                >
                    <span className="agent-plan-status">{e.status}</span>
                    <span className="agent-plan-content">{e.content}</span>
                </div>
            ))}
        </div>
    );
}

function TraceList({ items }: { items: TraceItem[] }): ReactElement {
    return (
        <>
            {items.map((item, index) => {
                if (item.type === "user") {
                    return (
                        <section key={index} className="user-prompt-bar" aria-label="User message">
                            {item.text}
                        </section>
                    );
                }
                if (item.type === "agent") {
                    return (
                        <div key={index} className="agent-response-stream">
                            <pre className="agent-response-text" aria-label="Agent response">
                                {item.text}
                            </pre>
                        </div>
                    );
                }
                if (item.type === "tool") {
                    return <ToolCallBlock key={index} item={item} />;
                }
                return <PlanBlock key={index} entries={item.entries} />;
            })}
        </>
    );
}

export type IbChatAppProps = {
    init: InitPayload;
    postSend: (body: string) => void;
    postCancel: () => void;
    extensionDispatchRef: RefObject<((message: ExtensionMessageAfterInit) => void) | null>;
};

/**
 * IB Chat editor webview: header, transcript, composer, and protocol-driven transcript updates.
 */
export function IbChatApp({ init, postSend, postCancel, extensionDispatchRef }: IbChatAppProps): ReactElement {
    const [state, dispatch] = useReducer(chatReducer, undefined, createInitialChatState);
    const [draft, setDraft] = useState("");
    const traceRef = useRef<HTMLElement | null>(null);

    extensionDispatchRef.current = (message: ExtensionMessageAfterInit) => {
        dispatch(message as ChatAction);
    };

    useLayoutEffect(() => {
        if (init.vscodeThemeVariables === undefined) {
            return;
        }
        for (const [key, value] of Object.entries(init.vscodeThemeVariables)) {
            document.documentElement.style.setProperty(key, value);
        }
    }, [init]);

    useLayoutEffect(() => {
        const el = traceRef.current;
        if (el) {
            el.scrollTop = el.scrollHeight;
        }
    }, [state.trace]);

    const workspaceText =
        init.workspaceLabel !== undefined && init.workspaceLabel.length > 0
            ? init.workspaceLabel
            : "No workspace folder open";

    const submit = (): void => {
        if (state.promptInFlight) {
            return;
        }
        const body = draft.trim();
        if (body.length === 0) {
            return;
        }
        setDraft("");
        dispatch({ type: "submit", body });
        postSend(body);
    };

    const onKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>): void => {
        if (event.key === "Enter" && !event.shiftKey) {
            event.preventDefault();
            submit();
        }
    };

    return (
        <Fragment>
            <header className="agent-header">
                <div className="agent-title-line">
                    IB Chat <span className="agent-version">{init.agentVersionLabel ?? ""}</span>
                </div>
                <div className="agent-meta-line" title={workspaceText}>
                    {workspaceText}
                </div>
                {init.acpAgentName !== undefined && init.acpAgentName.length > 0 ? (
                    <div className="agent-acp-name">ACP agent: {init.acpAgentName}</div>
                ) : null}
            </header>
            <div className="ib-chat-error" role="alert" hidden={state.errorText === null}>
                {state.errorText}
            </div>
            <main ref={traceRef} className="agent-trace" role="log" aria-label="Conversation">
                <TraceList items={state.trace} />
            </main>
            <footer className="composer-frame">
                <textarea
                    className="composer-input"
                    placeholder="Describe a task or reply to the agent…"
                    aria-label="Agent input"
                    rows={2}
                    value={draft}
                    disabled={state.promptInFlight}
                    onChange={(e) => setDraft(e.target.value)}
                    onKeyDown={onKeyDown}
                />
                <div className="composer-footer">
                    <span className="composer-hint">Enter to send · Shift+Enter for newline</span>
                    <button
                        type="button"
                        className="composer-cancel"
                        disabled={!state.promptInFlight}
                        onClick={() => postCancel()}
                    >
                        Cancel
                    </button>
                    <button
                        type="button"
                        className="composer-send"
                        disabled={state.promptInFlight}
                        onClick={() => submit()}
                    >
                        Send
                    </button>
                </div>
            </footer>
        </Fragment>
    );
}
