import { describe, expect, it } from "vite-plus/test";
import type { CursorContext, Scope } from "../../../document/types";
import { headingShowsRaw, rawHeadingBounds, rawHeadingClass } from "../raw";
import { styleClass, styleRange } from "../style";

const text = "# Title\n";

function heading(level = 1): Scope {
    return {
        kind: "heading",
        start: 0,
        end: text.length,
        contentStart: 2,
        contentEnd: 7,
        markers: [{ start: 0, end: 2 }],
        level,
    };
}

function onLine(): CursorContext {
    return {
        selectionFrom: 0,
        selectionTo: 0,
        lineStart: 0,
        lineEnd: 7,
        eolLength: 1,
    };
}

function away(): CursorContext {
    return {
        selectionFrom: 20,
        selectionTo: 20,
        lineStart: 20,
        lineEnd: 30,
        eolLength: 1,
    };
}

describe("heading", () => {
    it("uses inline-md-hN for the raw line and for the preview text", () => {
        const scope = heading(2);
        expect(text.slice(scope.contentStart, scope.contentEnd)).toBe("Title");
        expect(rawHeadingClass(scope)).toBe("inline-md-h2");
        expect(styleClass(scope)).toBe("inline-md-h2");
        expect(headingShowsRaw(scope, onLine())).toBe(true);
        expect(rawHeadingBounds(text, scope)).toEqual({ start: 0, end: 7 });
        expect(headingShowsRaw(scope, away())).toBe(false);
        expect(styleRange(scope)).toEqual({ start: 2, end: 7 });
        expect(styleClass({ ...scope, kind: "strong" })).toBeUndefined();
    });
});
