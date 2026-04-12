import type {
    ExtensionToWebviewMessage,
    IbChatSlashCommand,
    PlanEntry,
    ToolCallDiffRow,
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
    /** Structured diff when the agent sent `diff` content (preferred over plain `content`). */
    diffRows: ToolCallDiffRow[] | undefined;
    detailVisible: boolean;
};

export type TraceItem =
    | { type: "user"; text: string }
    | { type: "agent"; text: string }
    | TraceToolItem
    | { type: "plan"; entries: PlanEntry[] };

export type AcpAgentSelectionState = {
    currentName: string;
    availableNames: string[];
};

export type PermissionPromptState = {
    requestId: string;
    toolTitle: string;
    options: { optionId: string; name: string }[];
};

export type ChatState = {
    trace: TraceItem[];
    openStreamIndex: number | null;
    toolIndexById: Map<string, number>;
    promptInFlight: boolean;
    errorText: string | null;
    modelSelection: IbChatSessionModelSelection | null;
    acpAgentSelection: AcpAgentSelectionState | null;
    slashCommands: IbChatSlashCommand[];
    permissionPrompt: PermissionPromptState | null;
};

export type ChatAction =
    | ExtensionMessageAfterInit
    | { type: "submit"; body: string }
    | { type: "pickSessionModel"; modelId: string }
    | { type: "pickSessionAgent"; agentName: string }
    | { type: "clearPermissionPrompt" };

export function createInitialChatState(): ChatState {
    return {
        trace: [],
        openStreamIndex: null,
        toolIndexById: new Map(),
        promptInFlight: false,
        errorText: null,
        modelSelection: null,
        acpAgentSelection: null,
        slashCommands: [],
        permissionPrompt: null,
    };
}

/**
 * Builds initial chat state from the host `init` payload (model list from ACP or standalone readme seed).
 */
export function createChatStateFromInit(payload: InitPayload): ChatState {
    return {
        ...createInitialChatState(),
        modelSelection: payload.sessionModels ?? null,
        acpAgentSelection: buildAcpAgentSelectionFromInit(payload),
    };
}

function buildAcpAgentSelectionFromInit(payload: InitPayload): AcpAgentSelectionState | null {
    const listed = payload.availableAcpAgents;
    const named = payload.acpAgentName;
    if (listed !== undefined && listed.length > 0) {
        const current =
            named !== undefined && named.length > 0 && listed.includes(named) ? named : listed[0]!;
        return { currentName: current, availableNames: listed };
    }
    if (named !== undefined && named.length > 0) {
        return { currentName: named, availableNames: [named] };
    }
    return null;
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
        diffRows: undefined,
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
    content: string | undefined,
    subtitle: string | undefined,
    diffRows: ToolCallDiffRow[] | undefined
): ChatState {
    const idx = state.toolIndexById.get(toolCallId);
    if (idx !== undefined) {
        const item = state.trace[idx];
        if (item?.type !== "tool") {
            return state;
        }
        const mergedContent = content !== undefined ? content : item.content;
        const mergedDiffRows =
            diffRows !== undefined && diffRows.length > 0 ? diffRows : item.diffRows;
        const detailVisible =
            (mergedContent !== undefined && mergedContent.trim().length > 0) ||
            (mergedDiffRows !== undefined && mergedDiffRows.length > 0);
        const mergedSubtitle =
            subtitle !== undefined && subtitle.trim().length > 0 ? subtitle.trim() : item.subtitle;
        const trace = state.trace.slice();
        trace[idx] = {
            ...item,
            status,
            content: mergedContent,
            diffRows: mergedDiffRows,
            detailVisible,
            subtitle: mergedSubtitle,
        };
        return { ...state, trace };
    }
    const mergedContent = content;
    const mergedDiffRows = diffRows !== undefined && diffRows.length > 0 ? diffRows : undefined;
    const detailVisible =
        (mergedContent !== undefined && mergedContent.trim().length > 0) ||
        (mergedDiffRows !== undefined && mergedDiffRows.length > 0);
    const newItem: TraceToolItem = {
        type: "tool",
        toolCallId,
        title: "Tool",
        kind: undefined,
        subtitle: subtitle !== undefined && subtitle.trim().length > 0 ? subtitle.trim() : undefined,
        status,
        content: mergedContent,
        diffRows: mergedDiffRows,
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
    if (action.type === "pickSessionAgent") {
        if (state.acpAgentSelection === null) {
            return state;
        }
        return {
            ...state,
            acpAgentSelection: {
                ...state.acpAgentSelection,
                currentName: action.agentName,
            },
        };
    }
    if (action.type === "clearPermissionPrompt") {
        return { ...state, permissionPrompt: null };
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
        case "acpAgentSelection":
            return {
                ...state,
                acpAgentSelection: {
                    currentName: action.currentAgentName,
                    availableNames: action.availableAgentNames,
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
            return updateToolCall(
                state,
                action.toolCallId,
                action.status,
                action.content,
                action.subtitle,
                action.diffRows
            );
        case "slashCommands":
            return { ...state, slashCommands: action.commands };
        case "permissionRequest":
            return {
                ...state,
                permissionPrompt: {
                    requestId: action.requestId,
                    toolTitle: action.toolTitle,
                    options: action.options,
                },
            };
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
