import type {
    ExtensionToWebviewMessage,
    PlanEntry,
    ToolCallStatus,
} from "../../../src/chat/protocol/ibChatProtocol";
import type { IbChatSessionModelSelection } from "../../../src/chat/acp/agentSession/ibChatSessionModels";

export type InitPayload = Extract<ExtensionToWebviewMessage, { type: "init" }>;
export type ExtensionMessageAfterInit = Exclude<ExtensionToWebviewMessage, { type: "init" }>;

export type TraceToolItem = {
    type: "tool";
    toolCallId: string;
    title: string;
    kind: string | undefined;
    /** Dim terminal-style line (paths, args, preview); from ACP at tool start. */
    subtitle: string | undefined;
    status: ToolCallStatus;
    content: string | undefined;
    detailVisible: boolean;
};

export type TraceItem =
    | { type: "user"; text: string }
    | { type: "agent"; text: string }
    | TraceToolItem
    | { type: "plan"; entries: PlanEntry[] };

export type ChatState = {
    trace: TraceItem[];
    openStreamIndex: number | null;
    toolIndexById: Map<string, number>;
    promptInFlight: boolean;
    errorText: string | null;
    modelSelection: IbChatSessionModelSelection | null;
};

export type ChatAction =
    | ExtensionMessageAfterInit
    | { type: "submit"; body: string }
    | { type: "pickSessionModel"; modelId: string };

export function createInitialChatState(): ChatState {
    return {
        trace: [],
        openStreamIndex: null,
        toolIndexById: new Map(),
        promptInFlight: false,
        errorText: null,
        modelSelection: null,
    };
}

/**
 * Builds initial chat state from the host `init` payload (model list from ACP or standalone readme seed).
 */
export function createChatStateFromInit(payload: InitPayload): ChatState {
    return {
        ...createInitialChatState(),
        modelSelection: payload.sessionModels ?? null,
    };
}

function appendAgentText(state: ChatState, text: string): ChatState {
    const open = state.openStreamIndex;
    if (open !== null) {
        const existing = state.trace[open];
        if (existing?.type === "agent") {
            const trace = state.trace.slice();
            trace[open] = { type: "agent", text: existing.text + text };
            return { ...state, trace };
        }
    }
    const trace = [...state.trace, { type: "agent" as const, text }];
    return {
        ...state,
        trace,
        openStreamIndex: trace.length - 1,
    };
}

function appendToolCall(
    state: ChatState,
    toolCallId: string,
    title: string,
    kind: string | undefined,
    status: ToolCallStatus | undefined,
    subtitle: string | undefined
): ChatState {
    const newItem: TraceToolItem = {
        type: "tool",
        toolCallId,
        title,
        kind,
        subtitle,
        status: status ?? "pending",
        content: undefined,
        detailVisible: false,
    };
    const trace = [...state.trace, newItem];
    const toolIndexById = new Map(state.toolIndexById);
    toolIndexById.set(toolCallId, trace.length - 1);
    return {
        ...state,
        trace,
        toolIndexById,
        openStreamIndex: null,
    };
}

function updateToolCall(
    state: ChatState,
    toolCallId: string,
    status: ToolCallStatus,
    content: string | undefined
): ChatState {
    const idx = state.toolIndexById.get(toolCallId);
    if (idx !== undefined) {
        const item = state.trace[idx];
        if (item?.type !== "tool") {
            return state;
        }
        const mergedContent = content !== undefined ? content : item.content;
        const detailVisible = mergedContent !== undefined && mergedContent.trim().length > 0;
        const trace = state.trace.slice();
        trace[idx] = {
            ...item,
            status,
            content: mergedContent,
            detailVisible,
        };
        return { ...state, trace };
    }
    const mergedContent = content;
    const detailVisible = mergedContent !== undefined && mergedContent.trim().length > 0;
    const newItem: TraceToolItem = {
        type: "tool",
        toolCallId,
        title: "Tool",
        kind: undefined,
        subtitle: undefined,
        status,
        content: mergedContent,
        detailVisible,
    };
    const trace = [...state.trace, newItem];
    const toolIndexById = new Map(state.toolIndexById);
    toolIndexById.set(toolCallId, trace.length - 1);
    return {
        ...state,
        trace,
        toolIndexById,
        openStreamIndex: null,
    };
}

/**
 * Applies extension protocol messages and local submit actions to chat UI state.
 */
export function chatReducer(state: ChatState, action: ChatAction): ChatState {
    if (action.type === "submit") {
        return {
            ...state,
            trace: [...state.trace, { type: "user", text: action.body }],
            promptInFlight: true,
            errorText: null,
            openStreamIndex: null,
            toolIndexById: new Map(),
        };
    }
    if (action.type === "pickSessionModel") {
        if (state.modelSelection === null) {
            return state;
        }
        return {
            ...state,
            modelSelection: {
                ...state.modelSelection,
                currentModelId: action.modelId,
            },
        };
    }
    switch (action.type) {
        case "sessionModels":
            return {
                ...state,
                modelSelection: {
                    currentModelId: action.currentModelId,
                    availableModels: action.availableModels,
                },
            };
        case "appendAgentText":
            return appendAgentText(state, action.text);
        case "appendToolCall":
            return appendToolCall(
                state,
                action.toolCallId,
                action.title,
                action.kind,
                action.status,
                action.subtitle
            );
        case "updateToolCall":
            return updateToolCall(state, action.toolCallId, action.status, action.content);
        case "appendPlan": {
            const trace = [...state.trace, { type: "plan" as const, entries: action.entries }];
            return {
                ...state,
                trace,
                openStreamIndex: null,
            };
        }
        case "turnComplete":
            return {
                ...state,
                openStreamIndex: null,
                promptInFlight: false,
            };
        case "error":
            return {
                ...state,
                openStreamIndex: null,
                errorText: action.message,
                promptInFlight: false,
            };
        default:
            return state;
    }
}
