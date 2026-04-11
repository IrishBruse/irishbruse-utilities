import type * as acp from "@agentclientprotocol/sdk";
import type { ExtensionToWebviewMessage } from "../protocol/ibChatProtocol";

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
        case "tool_call":
            return [
                {
                    type: "appendToolCall",
                    toolCallId: update.toolCallId,
                    title: update.title,
                    kind: update.kind,
                    status: update.status ?? undefined,
                },
            ];
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
