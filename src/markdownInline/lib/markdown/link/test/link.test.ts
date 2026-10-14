import { describe, expect, it } from "vite-plus/test";
import type { Scope } from "../../../document/types";
import { rawLinkSpans } from "../raw";
import { styleClass, styleRange } from "../style";

const text = "[docs](https://example.com)";

function link(): Scope {
    return {
        kind: "link",
        start: 0,
        end: text.length,
        contentStart: 1,
        contentEnd: 5,
        markers: [
            { start: 0, end: 1 },
            { start: 5, end: 6 },
            { start: 6, end: text.length },
        ],
    };
}

describe("link", () => {
    it("styles the label and paints punctuation, label, and url when raw", () => {
        const scope = link();
        expect(text.slice(1, 5)).toBe("docs");
        expect(styleClass(scope)).toBe("inline-md-link");
        expect(styleRange(scope)).toEqual({ start: 1, end: 5 });
        expect(rawLinkSpans(text, scope)).toEqual([
            { start: 0, end: 1, className: "inline-md-link-punctuation" },
            { start: 5, end: 6, className: "inline-md-link-punctuation" },
            { start: 1, end: 5, className: "inline-md-link-label" },
            { start: 6, end: 7, className: "inline-md-link-punctuation" },
            { start: 7, end: text.length - 1, className: "inline-md-link-url" },
            { start: text.length - 1, end: text.length, className: "inline-md-link-punctuation" },
        ]);
        expect(styleClass({ ...scope, kind: "strong" })).toBeUndefined();
    });
});
