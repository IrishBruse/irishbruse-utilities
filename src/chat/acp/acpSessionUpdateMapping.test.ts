import { describe, expect, it } from "vitest";
import { sessionUpdateToWebviewMessages, type ToolCallKindTracking } from "./acpSessionUpdateMapping";

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

    it("adds subtitle from tool_call locations", () => {
        const messages = sessionUpdateToWebviewMessages({
            sessionUpdate: "tool_call",
            toolCallId: "t2",
            title: "Read file",
            kind: "read",
            locations: [{ path: "/workspace/src/a.ts" }],
        });
        expect(messages).toEqual([
            {
                type: "appendToolCall",
                toolCallId: "t2",
                title: "Read file",
                kind: "read",
                subtitle: "/workspace/src/a.ts",
            },
        ]);
    });

    it("adds subtitle from tool_call rawInput when no locations", () => {
        const messages = sessionUpdateToWebviewMessages({
            sessionUpdate: "tool_call",
            toolCallId: "t3",
            title: "Grep",
            rawInput: { pattern: "foo", path: "." },
        });
        expect(messages).toEqual([
            {
                type: "appendToolCall",
                toolCallId: "t3",
                title: "Grep",
                subtitle: '{"pattern":"foo","path":"."}',
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

    it("maps tool_call_update diff content to updateToolCall with summary text and diff rows", () => {
        const messages = sessionUpdateToWebviewMessages({
            sessionUpdate: "tool_call_update",
            toolCallId: "e1",
            status: "completed",
            content: [
                {
                    type: "diff",
                    path: "/proj/README.md",
                    oldText: "a\n",
                    newText: "b\n",
                },
            ],
        });
        expect(messages).toEqual([
            {
                type: "updateToolCall",
                toolCallId: "e1",
                status: "completed",
                content: "/proj/README.md\n1 line(s) before -> 1 line(s) after",
                diffRows: [
                    { kind: "removed", text: "a" },
                    { kind: "added", text: "b" },
                ],
                subtitle: "/proj/README.md",
            },
        ]);
    });

    it("maps tool_call_update rawOutput.content string to updateToolCall", () => {
        const messages = sessionUpdateToWebviewMessages({
            sessionUpdate: "tool_call_update",
            toolCallId: "r1",
            status: "completed",
            rawOutput: { content: "file body" },
        });
        expect(messages).toEqual([
            {
                type: "updateToolCall",
                toolCallId: "r1",
                status: "completed",
                content: "file body",
            },
        ]);
    });

    it("maps tool_call_update search stats rawOutput to updateToolCall", () => {
        const messages = sessionUpdateToWebviewMessages({
            sessionUpdate: "tool_call_update",
            toolCallId: "s1",
            status: "completed",
            rawOutput: { totalMatches: 38, truncated: false },
        });
        expect(messages).toEqual([
            {
                type: "updateToolCall",
                toolCallId: "s1",
                status: "completed",
                content: "38 match(es), complete",
            },
        ]);
    });

    it("maps tool_call_update terminal rawOutput to updateToolCall", () => {
        const messages = sessionUpdateToWebviewMessages({
            sessionUpdate: "tool_call_update",
            toolCallId: "x1",
            status: "completed",
            rawOutput: { exitCode: 0, stdout: "ok\n", stderr: "" },
        });
        expect(messages).toEqual([
            {
                type: "updateToolCall",
                toolCallId: "x1",
                status: "completed",
                content: "exit 0\nok",
            },
        ]);
    });

    it("maps tool_call_update terminal piece with command from rawInput", () => {
        const messages = sessionUpdateToWebviewMessages({
            sessionUpdate: "tool_call_update",
            toolCallId: "t1",
            status: "in_progress",
            rawInput: { command: "npm run build" },
            content: [{ type: "terminal", terminalId: "term-1" }],
        });
        expect(messages).toEqual([
            {
                type: "updateToolCall",
                toolCallId: "t1",
                status: "in_progress",
                content: "$ npm run build\nTerminal: term-1",
            },
        ]);
    });

    it("maps available_commands_update to slashCommands", () => {
        const messages = sessionUpdateToWebviewMessages({
            sessionUpdate: "available_commands_update",
            availableCommands: [
                { name: "plan", description: "Plan work", input: { hint: "topic" } },
                { name: "test", description: "Run tests" },
            ],
        } as never);
        expect(messages).toEqual([
            {
                type: "slashCommands",
                commands: [
                    { name: "plan", description: "Plan work", inputHint: "topic" },
                    { name: "test", description: "Run tests" },
                ],
            },
        ]);
    });

    it("adds subtitle from tool_call_update locations when present", () => {
        const messages = sessionUpdateToWebviewMessages({
            sessionUpdate: "tool_call_update",
            toolCallId: "l1",
            status: "completed",
            locations: [{ path: "/workspace/src/foo.ts" }],
            rawOutput: { content: "export {}" },
        });
        expect(messages).toEqual([
            {
                type: "updateToolCall",
                toolCallId: "l1",
                status: "completed",
                content: "export {}",
                subtitle: "/workspace/src/foo.ts",
            },
        ]);
    });

    it("adds read tool subtitle file name from rawOutput.path when kind was read", () => {
        const tracking: ToolCallKindTracking = { kindByToolId: new Map() };
        sessionUpdateToWebviewMessages(
            {
                sessionUpdate: "tool_call",
                toolCallId: "read1",
                title: "Read File",
                kind: "read",
                status: "pending",
                rawInput: {},
            },
            tracking
        );
        const messages = sessionUpdateToWebviewMessages(
            {
                sessionUpdate: "tool_call_update",
                toolCallId: "read1",
                status: "completed",
                rawOutput: { path: "/workspace/proj/README.md", content: "x" },
            },
            tracking
        );
        expect(messages).toEqual([
            {
                type: "updateToolCall",
                toolCallId: "read1",
                status: "completed",
                content: "x",
                subtitle: "README.md",
            },
        ]);
    });

    it("adds read tool subtitle from tool_call_update rawInput path when kind was read", () => {
        const tracking: ToolCallKindTracking = { kindByToolId: new Map() };
        sessionUpdateToWebviewMessages(
            {
                sessionUpdate: "tool_call",
                toolCallId: "read2",
                title: "Read File",
                kind: "read",
                status: "pending",
                rawInput: {},
            },
            tracking
        );
        const messages = sessionUpdateToWebviewMessages(
            {
                sessionUpdate: "tool_call_update",
                toolCallId: "read2",
                status: "completed",
                rawInput: { path: "/home/user/src/App.tsx" },
                rawOutput: { content: "export {}" },
            },
            tracking
        );
        expect(messages).toEqual([
            {
                type: "updateToolCall",
                toolCallId: "read2",
                status: "completed",
                content: "export {}",
                subtitle: "App.tsx",
            },
        ]);
    });

});
