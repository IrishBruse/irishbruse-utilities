import "./IbChatApp.css";
import "./scrollRegions.css";
import {
    Fragment,
    useCallback,
    useEffect,
    useLayoutEffect,
    useMemo,
    useReducer,
    useRef,
    useState,
    type KeyboardEvent,
    type ReactElement,
    type RefObject,
} from "react";
import { ChatComposer } from "./components/ChatComposer";
import { ChatHeader } from "./components/ChatHeader";
import { PermissionDialog } from "./components/PermissionDialog";
import { TraceList } from "./components/TraceList";
import {
    chatReducer,
    createChatStateFromInit,
    type ChatAction,
    type ExtensionMessageAfterInit,
    type InitPayload,
    type TraceItem,
} from "./chatReducer";

export type IbChatAppProps = {
    init: InitPayload;
    postSend: (body: string) => void;
    postCancel: () => void;
    postSetSessionAgent: (agentName: string) => void;
    postSetSessionModel: (modelId: string) => void;
    postSavePromptHistory: (entries: string[]) => void;
    postPermissionResponse: (
        payload: { requestId: string; selectedOptionId: string } | { requestId: string; cancelled: true }
    ) => void;
    extensionDispatchRef: RefObject<((message: ExtensionMessageAfterInit) => void) | null>;
};

/**
 * IB Chat editor webview: header, transcript, composer, and protocol-driven transcript updates.
 */
export function IbChatApp({
    init,
    postSend,
    postCancel,
    postSetSessionAgent,
    postSetSessionModel,
    postSavePromptHistory,
    postPermissionResponse,
    extensionDispatchRef,
}: IbChatAppProps): ReactElement {
    const [state, dispatch] = useReducer(chatReducer, init, createChatStateFromInit);
    const [draft, setDraft] = useState("");
    const [promptHistory, setPromptHistory] = useState<string[]>(init.promptHistory ?? []);
    const [promptHistoryBrowse, setPromptHistoryBrowse] = useState<{ pointer: number; restore: string } | null>(null);
    const [expandAllToolOutputs, setExpandAllToolOutputs] = useState(false);
    const traceRef = useRef<HTMLElement | null>(null);
    const traceContentRef = useRef<HTMLDivElement | null>(null);
    const stickToBottomRef = useRef(true);

    const scrollTraceToBottomIfPinned = useCallback((): void => {
        const el = traceRef.current;
        if (el !== null && stickToBottomRef.current) {
            el.scrollTop = el.scrollHeight;
        }
    }, []);

    const onTraceScroll = useCallback((): void => {
        const el = traceRef.current;
        if (el === null) {
            return;
        }
        const distanceFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
        stickToBottomRef.current = distanceFromBottom <= 48;
    }, []);

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
        scrollTraceToBottomIfPinned();
    }, [state.trace, scrollTraceToBottomIfPinned]);

    useEffect(() => {
        const content = traceContentRef.current;
        if (content === null) {
            return;
        }
        const observer = new ResizeObserver(() => {
            scrollTraceToBottomIfPinned();
        });
        observer.observe(content);
        return () => {
            observer.disconnect();
        };
    }, [scrollTraceToBottomIfPinned]);

    useEffect(() => {
        const onDocumentKeyDown = (event: globalThis.KeyboardEvent): void => {
            if (event.key.toLowerCase() !== "o" || (!event.ctrlKey && !event.metaKey)) {
                return;
            }
            const target = event.target;
            if (
                target !== null &&
                target instanceof HTMLElement &&
                target.closest("textarea, input, [contenteditable='true']")
            ) {
                return;
            }
            event.preventDefault();
            setExpandAllToolOutputs((expanded) => !expanded);
        };
        document.addEventListener("keydown", onDocumentKeyDown, true);
        return () => {
            document.removeEventListener("keydown", onDocumentKeyDown, true);
        };
    }, []);

    const workspaceText =
        init.workspaceLabel !== undefined && init.workspaceLabel.length > 0
            ? init.workspaceLabel
            : "No workspace folder open";

    const activityLabel = useMemo(
        () => composerActivityLabel(state.promptInFlight, state.trace, state.openStreamIndex),
        [state.promptInFlight, state.trace, state.openStreamIndex]
    );

    const onDraftChange = useCallback((value: string): void => {
        setDraft(value);
        setPromptHistoryBrowse((browse) => (browse !== null ? null : browse));
    }, []);

    const submit = (): void => {
        if (state.promptInFlight || state.permissionPrompt !== null) {
            return;
        }
        const body = draft.trim();
        if (body.length === 0) {
            return;
        }
        setDraft("");
        setPromptHistoryBrowse(null);
        setPromptHistory((prev) => {
            const next =
                prev.length > 0 && prev[prev.length - 1] === body ? prev : [...prev.slice(-49), body];
            postSavePromptHistory(next);
            return next;
        });
        stickToBottomRef.current = true;
        dispatch({ type: "submit", body });
        postSend(body);
    };

    const onComposerKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>): void => {
        const target = event.currentTarget;
        const start = target.selectionStart ?? 0;
        const end = target.selectionEnd ?? 0;
        const mod = event.shiftKey || event.ctrlKey || event.metaKey || event.altKey;

        if (event.key === "ArrowUp" && !mod) {
            if (promptHistoryBrowse !== null) {
                event.preventDefault();
                if (promptHistoryBrowse.pointer > 0) {
                    const nextPointer = promptHistoryBrowse.pointer - 1;
                    setPromptHistoryBrowse({ pointer: nextPointer, restore: promptHistoryBrowse.restore });
                    setDraft(promptHistory[nextPointer] ?? "");
                }
                return;
            }
            if (promptHistory.length > 0 && textareaAtFirstLineFirstColumn(start, end)) {
                event.preventDefault();
                const lastIdx = promptHistory.length - 1;
                setPromptHistoryBrowse({ pointer: lastIdx, restore: draft });
                setDraft(promptHistory[lastIdx] ?? "");
                return;
            }
        }

        if (event.key === "ArrowDown" && !mod && promptHistoryBrowse !== null) {
            event.preventDefault();
            if (promptHistoryBrowse.pointer < promptHistory.length - 1) {
                const nextPointer = promptHistoryBrowse.pointer + 1;
                setPromptHistoryBrowse({ pointer: nextPointer, restore: promptHistoryBrowse.restore });
                setDraft(promptHistory[nextPointer] ?? "");
            } else {
                setPromptHistoryBrowse(null);
                setDraft(promptHistoryBrowse.restore);
            }
            return;
        }

        if (event.key === "Enter" && !event.shiftKey) {
            event.preventDefault();
            submit();
        }
    };

    const permission = state.permissionPrompt;

    return (
        <Fragment>
            <div className="ib-chat-error" role="alert" hidden={state.errorText === null}>
                {state.errorText}
            </div>
            <div className="ib-chat-shell">
                <main ref={traceRef} className="agent-trace" role="log" aria-label="Conversation" onScroll={onTraceScroll}>
                    <div ref={traceContentRef}>
                        <TraceList
                            items={state.trace}
                            expandAllToolOutputs={expandAllToolOutputs}
                            onCollapseExpandAll={() => {
                                setExpandAllToolOutputs(false);
                            }}
                        />
                    </div>
                </main>
                <div className="ib-chat-composer-stack">
                    {permission !== null ? (
                        <PermissionDialog
                            toolTitle={permission.toolTitle}
                            options={permission.options}
                            onSelect={(optionId) => {
                                postPermissionResponse({ requestId: permission.requestId, selectedOptionId: optionId });
                                dispatch({ type: "clearPermissionPrompt" });
                            }}
                            onDismiss={() => {
                                postPermissionResponse({ requestId: permission.requestId, cancelled: true });
                                dispatch({ type: "clearPermissionPrompt" });
                            }}
                        />
                    ) : null}
                    <ChatComposer
                        activityLabel={activityLabel}
                        acpAgentSelection={state.acpAgentSelection}
                        modelSelection={state.modelSelection}
                        promptInFlight={state.promptInFlight}
                        inputBlocked={state.permissionPrompt !== null}
                        slashCommands={state.slashCommands}
                        draft={draft}
                        onDraftChange={onDraftChange}
                        onPickSessionAgent={(agentName) => {
                            dispatch({ type: "pickSessionAgent", agentName });
                            postSetSessionAgent(agentName);
                        }}
                        onPickSessionModel={(modelId) => {
                            dispatch({ type: "pickSessionModel", modelId });
                            postSetSessionModel(modelId);
                        }}
                        onSubmit={submit}
                        onCancel={postCancel}
                        onKeyDown={onComposerKeyDown}
                        workspaceText={workspaceText}
                    />
                </div>
            </div>
        </Fragment>
    );
}

/**
 * Whether the caret is at the start of the first line (for recalling prompt history with ArrowUp).
 */
function textareaAtFirstLineFirstColumn(selectionStart: number, selectionEnd: number): boolean {
    if (selectionStart !== selectionEnd) {
        return false;
    }
    return selectionStart === 0;
}

/**
 * Short status line for the composer while a prompt is in flight (tool kind, generating, or thinking).
 */
function composerActivityLabel(
    promptInFlight: boolean,
    trace: TraceItem[],
    openStreamIndex: number | null
): string | null {
    if (!promptInFlight) {
        return null;
    }
    for (let i = trace.length - 1; i >= 0; i--) {
        const item = trace[i];
        if (item?.type === "tool" && (item.status === "pending" || item.status === "in_progress")) {
            const k = item.kind?.toLowerCase();
            if (k === "read") {
                return "Reading…";
            }
            if (k === "edit") {
                return "Editing…";
            }
            if (k === "search") {
                return "Searching…";
            }
            if (k === "execute") {
                return "Running…";
            }
            const title = item.title.trim();
            return title.length > 0 ? `${title}…` : "Using tools…";
        }
    }
    if (openStreamIndex !== null) {
        const open = trace[openStreamIndex];
        if (open?.type === "agent") {
            return "Generating…";
        }
    }
    return "Thinking…";
}
