import { describe, expect, it } from "vite-plus/test";
import type { CursorContext } from "../../../../document/types";
import { listMarkerIsRawWhenTheCaretIsOnTheDash } from "../raw";
import { bulletStyleInject } from "../style";

function cursor(head: number, anchor = head): CursorContext {
    return {
        selectionFrom: anchor,
        selectionTo: head,
        lineStart: 0,
        lineEnd: 20,
        eolLength: 1,
    };
}

describe("listMarkerIsRawWhenTheCaretIsOnTheDash", () => {
    const dash = { start: 0, end: 1 };

    it("is raw when the caret is on the dash or right after it", () => {
        expect(listMarkerIsRawWhenTheCaretIsOnTheDash(dash, cursor(0))).toBe(true);
        expect(listMarkerIsRawWhenTheCaretIsOnTheDash(dash, cursor(1))).toBe(true);
        expect(listMarkerIsRawWhenTheCaretIsOnTheDash(dash, cursor(2))).toBe(false);
    });

    it("is raw when a selection covers the dash", () => {
        expect(listMarkerIsRawWhenTheCaretIsOnTheDash(dash, cursor(4, 0))).toBe(true);
        expect(listMarkerIsRawWhenTheCaretIsOnTheDash(dash, cursor(6, 2))).toBe(false);
    });
});

describe("bulletStyleInject", () => {
    it("paints a bullet mark", () => {
        expect(bulletStyleInject()).toEqual({
            content: "\u2022",
            className: "inline-md-list-mark",
        });
    });
});
