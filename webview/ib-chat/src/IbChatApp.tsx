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
    extensionDispatchRef,
}: IbChatAppProps): ReactElement {
    const [state, dispatch] = useReducer(chatReducer, init, createChatStateFromInit);
    const [draft, setDraft] = useState("");
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

    const submit = (): void => {
        if (state.promptInFlight) {
            return;
        }
        const body = draft.trim();
        if (body.length === 0) {
            return;
        }
        setDraft("");
        stickToBottomRef.current = true;
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
            <ChatHeader agentVersionLabel={init.agentVersionLabel} workspaceText={workspaceText} />
            <div className="ib-chat-error" role="alert" hidden={state.errorText === null}>
                {state.errorText}
            </div>
            <main
                ref={traceRef}
                className="agent-trace"
                role="log"
                aria-label="Conversation"
                onScroll={onTraceScroll}
            >
                <div ref={traceContentRef}>
                    <TraceList items={state.trace} expandAllToolOutputs={expandAllToolOutputs} />
                </div>
            </main>
            <ChatComposer
                activityLabel={activityLabel}
                acpAgentSelection={state.acpAgentSelection}
                modelSelection={state.modelSelection}
                promptInFlight={state.promptInFlight}
                draft={draft}
                onDraftChange={setDraft}
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
                onKeyDown={onKeyDown}
            />
        </Fragment>
    );
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
