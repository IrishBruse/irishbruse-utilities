import { describe, expect, it } from "vite-plus/test";
import type { Scope } from "../../../document/types";
import { rawMarkerRanges } from "../raw";
import { styleClass, styleRange } from "../style";

const text = "`code`";

function inlineCode(): Scope {
    return {
        kind: "inlineCode",
        start: 0,
        end: text.length,
        contentStart: 1,
        contentEnd: 5,
        markers: [
            { start: 0, end: 1 },
            { start: 5, end: 6 },
        ],
    };
}

describe("inline code", () => {
    it("styles the full span and leaves the backticks without a class", () => {
        const scope = inlineCode();
        expect(text.slice(1, 5)).toBe("code");
        expect(styleClass(scope)).toBe("inline-md-code");
        expect(styleRange(scope)).toEqual({ start: 0, end: text.length });
        expect(rawMarkerRanges(scope)).toEqual(scope.markers);
        expect(styleRange(scope)).toEqual({ start: scope.start, end: scope.end });
        expect(styleClass({ ...scope, kind: "codeBlock" })).toBeUndefined();
    });
});
