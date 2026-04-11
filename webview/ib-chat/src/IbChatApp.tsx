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
import { ChatComposer } from "./components/ChatComposer";
import { ChatHeader } from "./components/ChatHeader";
import { TraceList } from "./components/TraceList";
import {
    chatReducer,
    createChatStateFromInit,
    type ChatAction,
    type ExtensionMessageAfterInit,
    type InitPayload,
} from "./chatReducer";

export type IbChatAppProps = {
    init: InitPayload;
    postSend: (body: string) => void;
    postCancel: () => void;
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
    postSetSessionModel,
    extensionDispatchRef,
}: IbChatAppProps): ReactElement {
    const [state, dispatch] = useReducer(chatReducer, init, createChatStateFromInit);
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
            <ChatHeader
                agentVersionLabel={init.agentVersionLabel}
                workspaceText={workspaceText}
                acpAgentName={init.acpAgentName}
            />
            <div className="ib-chat-error" role="alert" hidden={state.errorText === null}>
                {state.errorText}
            </div>
            <main ref={traceRef} className="agent-trace" role="log" aria-label="Conversation">
                <TraceList items={state.trace} />
            </main>
            <ChatComposer
                modelSelection={state.modelSelection}
                promptInFlight={state.promptInFlight}
                draft={draft}
                onDraftChange={setDraft}
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
