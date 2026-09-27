import { describe, expect, it } from "vitest";
import { MockMarkdownDocument, handlePlaygroundMessage, type PlaygroundSession } from "./mockHost";

function session(text: string, prefixPainted = false): PlaygroundSession {
    return { document: new MockMarkdownDocument(text), prefixPainted };
}

describe("MockMarkdownDocument", () => {
    it("applies an edit without echoing it", () => {
        const state = session("hello");
        expect(handlePlaygroundMessage(state, { type: "edit", start: 5, endExclusive: 5, text: "!" })).toEqual([]);
        expect(state.document.text).toBe("hello!");
    });

    it("undo and redo post the restored text", () => {
        const state = session("hello");
        handlePlaygroundMessage(state, { type: "edit", start: 0, endExclusive: 5, text: "world" });

        expect(handlePlaygroundMessage(state, { type: "history", command: "undo" })).toEqual([
            { type: "update", content: "hello" },
        ]);
        expect(state.document.text).toBe("hello");

        expect(handlePlaygroundMessage(state, { type: "history", command: "redo" })).toEqual([
            { type: "update", content: "world" },
        ]);
        expect(state.document.text).toBe("world");
    });

    it("drops redo history after a new edit", () => {
        const state = session("ab");
        handlePlaygroundMessage(state, { type: "edit", start: 2, endExclusive: 2, text: "c" });
        handlePlaygroundMessage(state, { type: "history", command: "undo" });
        handlePlaygroundMessage(state, { type: "edit", start: 2, endExclusive: 2, text: "d" });

        expect(handlePlaygroundMessage(state, { type: "history", command: "redo" })).toEqual([]);
        expect(state.document.text).toBe("abd");
    });

    it("ignores undo and redo when that stack is empty", () => {
        const state = session("hello");
        expect(handlePlaygroundMessage(state, { type: "history", command: "undo" })).toEqual([]);
        expect(handlePlaygroundMessage(state, { type: "history", command: "redo" })).toEqual([]);
        expect(state.document.text).toBe("hello");
    });
});

describe("handlePlaygroundMessage", () => {
    it("sends the full text once when the first paint was a prefix", () => {
        const state = session("full text", true);
        expect(handlePlaygroundMessage(state, { type: "ready", documentVersion: 1 })).toEqual([
            { type: "update", content: "full text" },
        ]);
        expect(state.prefixPainted).toBe(false);
        expect(handlePlaygroundMessage(state, { type: "ready", documentVersion: 1 })).toEqual([]);
    });

    it("answers highlight requests with one unstyled token", () => {
        const state = session("");
        expect(handlePlaygroundMessage(state, { type: "highlight", requestId: 3, source: "const x", languageId: "ts" })).toEqual([
            {
                type: "highlightResult",
                requestId: 3,
                tokens: [{ length: 7, foreground: 0, fontStyle: 0 }],
                colorMap: [""],
            },
        ]);
        expect(handlePlaygroundMessage(state, { type: "highlight", requestId: 4, source: "", languageId: "ts" })).toEqual([
            { type: "highlightResult", requestId: 4, tokens: [], colorMap: [""] },
        ]);
    });
});
