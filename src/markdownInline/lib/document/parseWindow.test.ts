import { describe, expect, it } from "vite-plus/test";
import { blockSafeParseSpan } from "./parseWindow";
import { parseScopesRange } from "./scopes";

describe("blockSafeParseSpan", () => {
    it("includes the fence that contains the requested line", () => {
        const source = "before\n```\ncode\n```\n";
        const codeAt = source.indexOf("code");
        const span = blockSafeParseSpan(source, {
            startLine: 3,
            endLine: 3,
            startOffset: codeAt,
            endOffset: codeAt + 4,
            lineCount: 4,
        });
        const slice = source.slice(span.startOffset, span.endOffset);
        expect(slice.startsWith("```")).toBe(true);
        expect(slice).toContain("code");
        expect(slice).not.toContain("before");
        const scopes = parseScopesRange(source, span.startOffset, span.endOffset, 2);
        expect(scopes.some((scope) => scope.kind === "codeBlock")).toBe(true);
    });

    it("includes the table header when the request starts on a body row", () => {
        const source = "intro\n| a | b |\n| --- | --- |\n| 1 | 2 |\n";
        const bodyAt = source.indexOf("| 1 |");
        const span = blockSafeParseSpan(source, {
            startLine: 4,
            endLine: 4,
            startOffset: bodyAt,
            endOffset: bodyAt + 8,
            lineCount: 4,
        });
        const slice = source.slice(span.startOffset, span.endOffset);
        expect(slice.startsWith("| a |")).toBe(true);
        expect(slice).not.toContain("intro");
        const scopes = parseScopesRange(source, span.startOffset, span.endOffset, 2);
        expect(scopes.some((scope) => scope.kind === "table")).toBe(true);
    });
});
