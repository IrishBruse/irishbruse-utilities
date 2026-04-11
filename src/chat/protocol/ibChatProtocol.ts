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
export type WebviewToExtensionMessage =
    | { type: "ready" }
    | { type: "send"; body: string }
    | { type: "cancel" }
    | { type: "setSessionModel"; modelId: string };

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
          /** Optional `--vscode-*` overrides applied on `document.documentElement` (VS Code injects these in the real webview). */
          vscodeThemeVariables?: Record<string, string>;
          /** From ACP `session/new` when available (standalone may seed from `mock/readme.ndjson`). */
          sessionModels?: IbChatSessionModelSelection;
      }
    | {
          type: "sessionModels";
          currentModelId: string;
          availableModels: IbChatSessionModelSelection["availableModels"];
      }
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
    | { type: "updateToolCall"; toolCallId: string; status: ToolCallStatus; content?: string }
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
    return null;
}
