import { describe, expect, it } from "vitest";
import { blockquoteContentIndex, blockquoteDepthClass, blockquoteLineDepth } from "./blockquote";

describe("blockquoteLineDepth", () => {
    it("counts nested markers", () => {
        expect(blockquoteLineDepth("> Quote")).toBe(1);
        expect(blockquoteLineDepth("> > Nested")).toBe(2);
        expect(blockquoteLineDepth(">  - List")).toBe(1);
        expect(blockquoteLineDepth(">")).toBe(1);
    });

    it("ignores non-quote lines", () => {
        expect(blockquoteLineDepth("plain")).toBe(0);
    });
});

describe("blockquoteContentIndex", () => {
    it("starts after the quote marks", () => {
        expect(blockquoteContentIndex("> Quote")).toBe(2);
        expect(blockquoteContentIndex("> > Nested")).toBe(4);
        expect(blockquoteContentIndex(">")).toBe(1);
    });
});

describe("blockquoteDepthClass", () => {
    it("clamps depth for CSS classes", () => {
        expect(blockquoteDepthClass(0)).toBe("inline-md-quote-depth-1");
        expect(blockquoteDepthClass(3)).toBe("inline-md-quote-depth-3");
        expect(blockquoteDepthClass(9)).toBe("inline-md-quote-depth-5");
    });
});
