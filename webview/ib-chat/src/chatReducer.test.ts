import { describe, expect, it } from "vitest";
import { chatReducer, createInitialChatState } from "./chatReducer";

describe("chatReducer", () => {
    it("merges appendToolCall into an existing tool row from an earlier updateToolCall", () => {
        let state = createInitialChatState();
        state = chatReducer(state, {
            type: "updateToolCall",
            toolCallId: "early",
            status: "pending",
            subtitle: "npm test",
            content: undefined,
            diffRows: undefined,
        });
        expect(state.trace).toHaveLength(1);
        const before = state.trace[0];
        expect(before?.type).toBe("tool");
        if (before?.type !== "tool") {
            return;
        }
        expect(before.title).toBe("Tool");
        state = chatReducer(state, {
            type: "appendToolCall",
            toolCallId: "early",
            title: "Run command",
            kind: "execute",
            status: "in_progress",
            subtitle: undefined,
        });
        expect(state.trace).toHaveLength(1);
        const after = state.trace[0];
        expect(after?.type).toBe("tool");
        if (after?.type !== "tool") {
            return;
        }
        expect(after.title).toBe("Run command");
        expect(after.kind).toBe("execute");
        expect(after.subtitle).toBe("npm test");
    });
});
