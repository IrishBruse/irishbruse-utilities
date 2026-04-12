import type { IbChatSessionModelSelection } from "../acp/agentSession/ibChatSessionModels";

/** Plan entry forwarded from an ACP agent plan update. */
export type PlanEntry = {
    content: string;
    status: string;
    priority?: string;
};

/** Tool call status forwarded from ACP. */
export type ToolCallStatus = "pending" | "in_progress" | "completed" | "failed";

/**
 * Messages sent from the IB Chat webview to the extension host.
 */
/** Line-level diff for tool output (git-style presentation in the webview). */
export type ToolCallDiffRow = {
    kind: "removed" | "added" | "context";
    text: string;
};

/** Slash commands advertised by the agent via `available_commands_update`. */
export type IbChatSlashCommand = {
    name: string;
    description: string;
    inputHint?: string;
};

export type WebviewToExtensionMessage =
    | { type: "ready" }
    | { type: "send"; body: string }
    | { type: "cancel" }
    | { type: "setSessionModel"; modelId: string }
    | { type: "setSessionAgent"; agentName: string }
    | { type: "permissionResponse"; requestId: string; selectedOptionId: string }
    | { type: "permissionResponse"; requestId: string; cancelled: true }
    /** Persists composer Arrow Up / Down prompt history for this session. */
    | { type: "savePromptHistory"; entries: string[] };

/**
 * Messages sent from the extension host to the IB Chat webview.
 */
export type ExtensionToWebviewMessage =
    | {
          type: "init";
          sessionId: string;
          title: string;
          workspaceLabel?: string;
          agentVersionLabel?: string;
          acpAgentName?: string;
          /** Display names from `ib-utilities.acpAgents` for the agent picker (same order as settings). */
          availableAcpAgents?: string[];
          /** Optional `--vscode-*` overrides applied on `document.documentElement` (VS Code injects these in the real webview). */
          vscodeThemeVariables?: Record<string, string>;
          /** From ACP `session/new` when available (standalone may seed from `mock/readme.ndjson`). */
          sessionModels?: IbChatSessionModelSelection;
          /** Restored composer prompt history (Arrow Up / Down), keyed by session in workspace storage. */
          promptHistory?: string[];
      }
    | {
          type: "sessionModels";
          currentModelId: string;
          availableModels: IbChatSessionModelSelection["availableModels"];
      }
    | { type: "acpAgentSelection"; currentAgentName: string; availableAgentNames: string[] }
    | { type: "appendAgentText"; text: string }
    | {
          type: "appendToolCall";
          toolCallId: string;
          title: string;
          kind?: string;
          status?: ToolCallStatus;
          /** Secondary line (arguments, path, or preview), shown like terminal dim text. */
          subtitle?: string;
      }
    | {
          type: "updateToolCall";
          toolCallId: string;
          status: ToolCallStatus;
          content?: string;
          /** When set, replaces the tool row subtitle (e.g. path from `locations` or diff on completion). */
          subtitle?: string;
          /** Structured line diff for `diff` tool content; takes precedence over plain `content` in the UI. */
          diffRows?: ToolCallDiffRow[];
      }
    | {
          type: "permissionRequest";
          requestId: string;
          toolTitle: string;
          options: { optionId: string; name: string }[];
      }
    | { type: "slashCommands"; commands: IbChatSlashCommand[] }
    | { type: "appendPlan"; entries: PlanEntry[] }
    | { type: "turnComplete"; stopReason: string }
    | { type: "error"; message: string };

/**
 * True when `raw` is a non-null object (`typeof null === "object"` is excluded). Used to ignore
 * primitives on VS Code webview `message` events while still forwarding extension payloads whose
 * `type` may not be a plain string after structured cloning.
 */
export function isPotentiallyExtensionPostMessageData(raw: unknown): raw is Record<string, unknown> {
    return raw !== null && typeof raw === "object";
}

/**
 * Parses an untrusted `postMessage` payload from the webview.
 */
export function tryParseWebviewMessage(raw: unknown): WebviewToExtensionMessage | null {
    if (raw === null || typeof raw !== "object") {
        return null;
    }
    const record = raw as Record<string, unknown>;
    const messageType = record.type;
    if (messageType === "ready") {
        return { type: "ready" };
    }
    if (messageType === "send" && typeof record.body === "string") {
        return { type: "send", body: record.body };
    }
    if (messageType === "cancel") {
        return { type: "cancel" };
    }
    if (messageType === "setSessionModel" && typeof record.modelId === "string" && record.modelId.length > 0) {
        return { type: "setSessionModel", modelId: record.modelId };
    }
    if (messageType === "setSessionAgent" && typeof record.agentName === "string" && record.agentName.length > 0) {
        return { type: "setSessionAgent", agentName: record.agentName };
    }
    if (messageType === "permissionResponse" && typeof record.requestId === "string" && record.requestId.length > 0) {
        if (record.cancelled === true) {
            return { type: "permissionResponse", requestId: record.requestId, cancelled: true };
        }
        if (typeof record.selectedOptionId === "string" && record.selectedOptionId.length > 0) {
            return {
                type: "permissionResponse",
                requestId: record.requestId,
                selectedOptionId: record.selectedOptionId,
            };
        }
    }
    if (messageType === "savePromptHistory" && Array.isArray(record.entries)) {
        const entries: string[] = [];
        for (const item of record.entries) {
            if (typeof item !== "string") {
                continue;
            }
            entries.push(item);
            if (entries.length >= 55) {
                break;
            }
        }
        return { type: "savePromptHistory", entries };
    }
    return null;
}
