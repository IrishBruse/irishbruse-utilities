import type * as acp from "@agentclientprotocol/sdk";
import type { ExtensionToWebviewMessage } from "../protocol/ibChatProtocol";

function firstToolCallTextPreview(call: acp.ToolCall): string | undefined {
    if (!call.content || call.content.length === 0) {
        return undefined;
    }
    for (const block of call.content) {
        if (block.type === "content" && block.content.type === "text") {
            const t = block.content.text.trim();
            if (t.length > 0) {
                return t;
            }
        }
    }
    return undefined;
}

function formatToolRawInput(raw: unknown): string | undefined {
    if (raw === undefined || raw === null) {
        return undefined;
    }
    if (typeof raw === "string") {
        const t = raw.trim();
        return t.length > 0 ? t : undefined;
    }
    if (typeof raw === "object" && !Array.isArray(raw) && Object.keys(raw as object).length === 0) {
        return undefined;
    }
    try {
        const s = JSON.stringify(raw);
        return s !== undefined && s !== "{}" && s !== "[]" ? s : undefined;
    } catch {
        return String(raw);
    }
}

/**
 * Builds the dim subtitle line for a tool call (paths, arguments, or inline text from the agent).
 */
export function toolCallSubtitleFromToolCall(call: acp.ToolCall): string | undefined {
    const fromContent = firstToolCallTextPreview(call);
    if (fromContent !== undefined) {
        return fromContent;
    }
    if (call.locations && call.locations.length > 0) {
        const locPath = call.locations[0]!.path.trim();
        if (locPath.length > 0) {
            return locPath;
        }
    }
    return formatToolRawInput(call.rawInput);
}

/**
 * Maps a single ACP session/update payload to zero or more webview protocol messages.
 */
export function sessionUpdateToWebviewMessages(update: acp.SessionUpdate): ExtensionToWebviewMessage[] {
    switch (update.sessionUpdate) {
        case "agent_message_chunk": {
            const block = update.content;
            if (block.type === "text") {
                return [{ type: "appendAgentText", text: block.text }];
            }
            return [];
        }
        case "tool_call": {
            const subtitle = toolCallSubtitleFromToolCall(update);
            return [
                {
                    type: "appendToolCall",
                    toolCallId: update.toolCallId,
                    title: update.title,
                    kind: update.kind,
                    status: update.status ?? undefined,
                    ...(subtitle !== undefined ? { subtitle } : {}),
                },
            ];
        }
        case "tool_call_update": {
            let contentText: string | undefined;
            if (update.content && update.content.length > 0) {
                const first = update.content[0];
                if (first.type === "content" && first.content.type === "text") {
                    contentText = first.content.text;
                }
            }
            return [
                {
                    type: "updateToolCall",
                    toolCallId: update.toolCallId,
                    status: update.status ?? "completed",
                    content: contentText,
                },
            ];
        }
        case "plan":
            return [
                {
                    type: "appendPlan",
                    entries: update.entries.map((e) => ({
                        content: e.content,
                        status: e.status,
                        priority: e.priority,
                    })),
                },
            ];
        case "agent_thought_chunk":
        case "user_message_chunk":
        default:
            return [];
    }
}
