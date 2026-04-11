import { describe, expect, it } from "vitest";
import { sessionUpdateToWebviewMessages } from "./acpSessionUpdateMapping";

describe("sessionUpdateToWebviewMessages", () => {
    it("maps agent_message_chunk text to appendAgentText", () => {
        const messages = sessionUpdateToWebviewMessages({
            sessionUpdate: "agent_message_chunk",
            content: { type: "text", text: "hello" },
        });
        expect(messages).toEqual([{ type: "appendAgentText", text: "hello" }]);
    });

    it("maps tool_call to appendToolCall", () => {
        const messages = sessionUpdateToWebviewMessages({
            sessionUpdate: "tool_call",
            toolCallId: "t1",
            title: "Read file",
            kind: "read",
            status: "pending",
        });
        expect(messages).toEqual([
            {
                type: "appendToolCall",
                toolCallId: "t1",
                title: "Read file",
                kind: "read",
                status: "pending",
            },
        ]);
    });

    it("maps plan to appendPlan", () => {
        const messages = sessionUpdateToWebviewMessages({
            sessionUpdate: "plan",
            entries: [
                { content: "Step A", status: "pending", priority: "high" },
                { content: "Step B", status: "completed", priority: "low" },
            ],
        });
        expect(messages).toEqual([
            {
                type: "appendPlan",
                entries: [
                    { content: "Step A", status: "pending", priority: "high" },
                    { content: "Step B", status: "completed", priority: "low" },
                ],
            },
        ]);
    });
});
