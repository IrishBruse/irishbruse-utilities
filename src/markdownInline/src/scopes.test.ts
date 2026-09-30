import { describe, expect, it } from "vitest";
import { parseScopes } from "./scopes";
import type { Scope } from "./types";

function find(source: string, kind: Scope["kind"]): Scope {
    const scope = parseScopes(source).find((item) => item.kind === kind);
    if (!scope) {
        throw new Error(`missing ${kind} in ${JSON.stringify(source)}`);
    }
    return scope;
}

function markerText(source: string, scope: Scope): string[] {
    return scope.markers.map((marker) => source.slice(marker.start, marker.end));
}

describe("parseScopes", () => {
    it("reads an ATX heading and the space after the hashes", () => {
        const source = "# Hello";
        const heading = find(source, "heading");
        expect(heading.level).toBe(1);
        expect(markerText(source, heading)).toEqual(["# "]);
        expect(source.slice(heading.contentStart, heading.contentEnd)).toBe("Hello");
    });

    it("reads strong, emphasis, strike, and inline code markers", () => {
        const source = "**bold** *em* ~~no~~ `code`";
        const scopes = parseScopes(source);
        const strong = scopes.find((scope) => scope.kind === "strong");
        const emphasis = scopes.find((scope) => scope.kind === "emphasis");
        const strike = scopes.find((scope) => scope.kind === "strikethrough");
        const code = scopes.find((scope) => scope.kind === "inlineCode");
        expect(strong && markerText(source, strong)).toEqual(["**", "**"]);
        expect(strong && source.slice(strong.contentStart, strong.contentEnd)).toBe("bold");
        expect(emphasis && markerText(source, emphasis)).toEqual(["*", "*"]);
        expect(strike && markerText(source, strike)).toEqual(["~~", "~~"]);
        expect(code && markerText(source, code)).toEqual(["`", "`"]);
        expect(code && source.slice(code.contentStart, code.contentEnd)).toBe("code");
    });

    it("reads image alt and url, and link markers", () => {
        const source = "![Dot](dot.png) and [site](https://example.com)";
        const image = find(source, "image");
        const link = parseScopes(source).find((scope) => scope.kind === "link");
        expect(image.alt).toBe("Dot");
        expect(image.url).toBe("dot.png");
        expect(source.slice(image.start, image.end)).toBe("![Dot](dot.png)");
        expect(link?.url).toBe("https://example.com");
        expect(link && markerText(source, link)).toEqual(["[", "]", "(https://example.com)"]);
    });

    it("hides unordered markers and keeps ordered numbers out of scopes", () => {
        const source = "- item\n1. ordered\n";
        const scopes = parseScopes(source);
        const markers = scopes.filter((scope) => scope.kind === "listMarker");
        expect(markers).toHaveLength(1);
        expect(markers[0] && source.slice(markers[0].start, markers[0].end)).toBe("- ");
        expect(source.slice(0).includes("1.")).toBe(true);
    });

    it("reads task checkboxes", () => {
        const open = find("- [ ] task\n", "task");
        const done = find("- [x] task\n", "task");
        expect(open.checked).toBe(false);
        expect(done.checked).toBe(true);
    });

    it("reads quote prefixes and fenced code language", () => {
        const quote = "> quoted\n";
        const prefix = find(quote, "blockquoteMarker");
        expect(quote.slice(prefix.start, prefix.end).startsWith(">")).toBe(true);
        expect(parseScopes(quote).some((scope) => scope.kind === "blockquote")).toBe(true);

        const fence = "```ts\nconst n = 1;\n```\n";
        const block = find(fence, "codeBlock");
        expect(block.language).toBe("ts");
        expect(markerText(fence, block)[0]?.startsWith("```")).toBe(true);
    });
});
