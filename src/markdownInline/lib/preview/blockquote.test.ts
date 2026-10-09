import { describe, expect, it } from "vitest";
import { blockquoteContentIndex, blockquoteDepthClass, blockquoteLineDepth, blockquoteWrapIndentColumns } from "./blockquote";

describe("blockquoteLineDepth", () => {
    it("counts nested markers", () => {
        expect(blockquoteLineDepth("> Quote")).toBe(1);
        expect(blockquoteLineDepth("> > Nested")).toBe(2);
        expect(blockquoteLineDepth(">  - List")).toBe(1);
        expect(blockquoteLineDepth(">")).toBe(1);
    });

    it("ignores non-quote lines", () => {
        expect(blockquoteLineDepth("plain")).toBe(0);
        expect(blockquoteLineDepth("  plain")).toBe(0);
    });

    it("skips indentation before the quote mark", () => {
        expect(blockquoteLineDepth("  > Quote")).toBe(1);
        expect(blockquoteLineDepth("\t> Quote")).toBe(1);
        expect(blockquoteContentIndex("  > Quote")).toBe(4);
        expect(blockquoteContentIndex("\t> Quote")).toBe(3);
    });
});

describe("blockquoteContentIndex", () => {
    it("starts after the quote marks", () => {
        expect(blockquoteContentIndex("> Quote")).toBe(2);
        expect(blockquoteContentIndex("> > Nested")).toBe(4);
        expect(blockquoteContentIndex(">")).toBe(1);
    });
});

describe("blockquoteWrapIndentColumns", () => {
    it("counts the quote marks that are not already line indent", () => {
        expect(blockquoteWrapIndentColumns("> Quote", 4)).toBe(2);
        expect(blockquoteWrapIndentColumns("> > Nested", 4)).toBe(4);
        expect(blockquoteWrapIndentColumns("  > Quote", 4)).toBe(2);
        expect(blockquoteWrapIndentColumns("\t> Quote", 4)).toBe(2);
        expect(blockquoteWrapIndentColumns(">", 4)).toBe(1);
        expect(blockquoteWrapIndentColumns("plain", 4)).toBe(0);
        expect(blockquoteWrapIndentColumns("  plain", 4)).toBe(0);
        expect(blockquoteWrapIndentColumns("> Quote", 0)).toBe(2);
    });
});

describe("blockquoteDepthClass", () => {
    it("clamps depth for CSS classes", () => {
        expect(blockquoteDepthClass(0)).toBe("inline-md-quote-depth-1");
        expect(blockquoteDepthClass(3)).toBe("inline-md-quote-depth-3");
        expect(blockquoteDepthClass(9)).toBe("inline-md-quote-depth-5");
    });
});
