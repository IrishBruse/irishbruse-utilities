import { describe, expect, it } from "vite-plus/test";
import type { CursorContext, Scope } from "../../../../document/types";
import { isMermaidCodeBlock, mermaidShowsPreviewZone } from "../raw";

function cursor(head: number, lineStart: number, lineEnd: number, anchor = head): CursorContext {
    return { selectionFrom: anchor, selectionTo: head, lineStart, lineEnd, eolLength: 1 };
}

function mermaidBlock(): Scope {
    return {
        kind: "codeBlock",
        start: 0,
        end: 40,
        contentStart: 12,
        contentEnd: 36,
        language: "mermaid",
        markers: [],
    };
}

describe("isMermaidCodeBlock", () => {
    it("accepts only a mermaid language id", () => {
        expect(isMermaidCodeBlock(undefined)).toBe(false);
        expect(isMermaidCodeBlock("")).toBe(false);
        expect(isMermaidCodeBlock("  Mermaid  ")).toBe(true);
        expect(isMermaidCodeBlock("graph")).toBe(false);
    });
});

describe("mermaidShowsPreviewZone", () => {
    const scope = mermaidBlock();

    it("shows the zone when the caret is outside the block", () => {
        expect(mermaidShowsPreviewZone(scope, cursor(80, 50, 90), false)).toBe(true);
    });

    it("hides the zone on find hits or overlapping selection", () => {
        expect(mermaidShowsPreviewZone(scope, cursor(80, 50, 90), true)).toBe(false);
        expect(mermaidShowsPreviewZone(scope, cursor(20, 0, 50, 0), false)).toBe(false);
    });

    it("ignores non-mermaid blocks", () => {
        expect(
            mermaidShowsPreviewZone({ ...scope, language: "ts" }, cursor(80, 50, 90), false),
        ).toBe(false);
    });
});
