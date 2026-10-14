import { describe, expect, it } from "vite-plus/test";
import type { CursorContext } from "../../../../document/types";
import { taskMarkerIsRawWhenTheCaretIsOnTheMarkerRange } from "../raw";
import { taskCheckboxClass, taskSpacerInject } from "../style";

function cursor(head: number, anchor = head): CursorContext {
    return {
        selectionFrom: anchor,
        selectionTo: head,
        lineStart: 0,
        lineEnd: 20,
        eolLength: 1,
    };
}

describe("taskMarkerIsRawWhenTheCaretIsOnTheMarkerRange", () => {
    const marker = { start: 2, end: 5 };

    it("is raw when the caret is on the marker range", () => {
        expect(taskMarkerIsRawWhenTheCaretIsOnTheMarkerRange(marker, cursor(2))).toBe(true);
        expect(taskMarkerIsRawWhenTheCaretIsOnTheMarkerRange(marker, cursor(4))).toBe(true);
        expect(taskMarkerIsRawWhenTheCaretIsOnTheMarkerRange(marker, cursor(5))).toBe(false);
        expect(taskMarkerIsRawWhenTheCaretIsOnTheMarkerRange(marker, cursor(1))).toBe(false);
    });

    it("is raw when a selection covers the marker range", () => {
        expect(taskMarkerIsRawWhenTheCaretIsOnTheMarkerRange(marker, cursor(6, 2))).toBe(true);
        expect(taskMarkerIsRawWhenTheCaretIsOnTheMarkerRange(marker, cursor(8, 5))).toBe(false);
    });
});

describe("taskSpacerInject", () => {
    it("paints a checkbox spacer and names the checkbox class", () => {
        expect(taskSpacerInject()).toEqual({
            content: "\u2610 ",
            className: "inline-md-task-spacer",
        });
        expect(taskCheckboxClass).toBe("inline-md-task");
    });
});
