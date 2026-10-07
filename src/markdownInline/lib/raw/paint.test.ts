import { describe, expect, it } from "vitest";
import type { Scope } from "../document/types";
import { rawGhostClass, rawHeadingBounds, rawHeadingClass, rawLinkSpans } from "./paint";

function heading(level?: number): Scope {
    return {
        kind: "heading",
        start: 0,
        end: 8,
        contentStart: 2,
        contentEnd: 7,
        markers: [{ start: 0, end: 2 }],
        level,
    };
}

describe("rawGhostClass", () => {
    it("names the raw ghost inline class", () => {
        expect(rawGhostClass()).toBe("inline-md-ghost");
    });
});

describe("rawHeadingBounds", () => {
    it("covers the heading through a trailing line break", () => {
        expect(rawHeadingBounds("# Title\n", heading())).toEqual({ start: 0, end: 7 });
        expect(rawHeadingBounds("# Title\r\n", { ...heading(), end: 9 })).toEqual({ start: 0, end: 7 });
        expect(rawHeadingBounds("# Title", { ...heading(), end: 7 })).toEqual({ start: 0, end: 7 });
    });
});

describe("rawHeadingClass", () => {
    it("uses the same heading scale as formatted headings", () => {
        expect(rawHeadingClass(heading(1))).toBe("inline-md-h1");
        expect(rawHeadingClass(heading(6))).toBe("inline-md-h6");
        expect(rawHeadingClass(heading())).toBe("inline-md-h1");
        expect(rawHeadingClass(heading(9))).toBe("inline-md-h1");
    });
});

describe("rawLinkSpans", () => {
    it("paints the label and the url when the link is raw", () => {
        const text = "[docs](https://example.com)";
        const scope: Scope = {
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
        expect(rawLinkSpans(text, scope)).toEqual([
            { start: 0, end: 1, className: "inline-md-link-punctuation" },
            { start: 5, end: 6, className: "inline-md-link-punctuation" },
            { start: 1, end: 5, className: "inline-md-link-label" },
            { start: 6, end: 7, className: "inline-md-link-punctuation" },
            { start: 7, end: text.length - 1, className: "inline-md-link-url" },
            { start: text.length - 1, end: text.length, className: "inline-md-link-punctuation" },
        ]);
    });

    it("paints only the label when the link has no destination", () => {
        const text = "[docs]";
        const scope: Scope = {
            kind: "link",
            start: 0,
            end: text.length,
            contentStart: 1,
            contentEnd: 5,
            markers: [{ start: 0, end: 1 }, { start: 5, end: 6 }],
        };
        expect(rawLinkSpans(text, scope)).toEqual([
            { start: 0, end: text.length, className: "inline-md-link-label" },
        ]);
    });
});
