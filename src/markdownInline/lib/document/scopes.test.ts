import { afterEach, describe, expect, it, vi } from "vitest";
import { parseScopes } from "./scopes";
import type { Scope, TextRange } from "./types";

const synthetic = vi.hoisted(() => ({
    events: null as Array<["enter" | "exit", { type: string; start: { offset?: number }; end: { offset?: number } }]> | null,
}));

vi.mock("micromark", async () => {
    const actual = await vi.importActual<typeof import("micromark")>("micromark");
    return {
        ...actual,
        parse: (options: Parameters<typeof actual.parse>[0]) => {
            if (synthetic.events) {
                return { document: () => ({ write: () => synthetic.events }) };
            }
            return actual.parse(options);
        },
        postprocess: (events: Parameters<typeof actual.postprocess>[0]) => {
            return synthetic.events ? events : actual.postprocess(events);
        },
        preprocess: () => {
            const read = actual.preprocess();
            return (...args: Parameters<typeof read>) => (synthetic.events ? [] : read(...args));
        },
    };
});

afterEach(() => {
    synthetic.events = null;
});

function mark(type: "enter" | "exit", tokenType: string, start: number, end: number, offset = true) {
    return [type, {
        type: tokenType,
        start: offset ? { offset: start } : {},
        end: offset ? { offset: end } : {},
    }] as ["enter" | "exit", { type: string; start: { offset?: number }; end: { offset?: number } }];
}

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

    it("reads a gfm table header and keeps inline code inside a cell", () => {
        const source = [
            "| Case | Source hint | Expected |",
            "| :--- | :--- | :--- |",
            "| Mid-sentence | `word word` (single space) | No dot between words |",
            "",
        ].join("\n");
        const table = find(source, "table");
        const cellText = (cell: TextRange): string => source.slice(cell.start, cell.end).trim();
        expect(table.rows?.[0]?.map(cellText)).toEqual(["Case", "Source hint", "Expected"]);
        expect(table.rows?.map((row) => row.length)).toEqual([3, 3]);
        const hint = table.rows?.[1]?.[1];
        const code = parseScopes(source).find((scope) => scope.kind === "inlineCode");
        expect(hint && code && code.start >= hint.start && code.end <= hint.end).toBe(true);
        expect(code && source.slice(code.contentStart, code.contentEnd)).toBe("word word");
    });

    it("reads nested quotes, closing hashes, and an empty heading", () => {
        const nested = "> > nested\n";
        const quotes = parseScopes(nested).filter((scope) => scope.kind === "blockquote");
        expect(quotes).toHaveLength(2);
        expect(nested.slice(quotes[1]!.contentStart, quotes[1]!.contentEnd)).toContain("nested");

        const closed = "# Hello #";
        const heading = find(closed, "heading");
        expect(heading.level).toBe(1);
        expect(closed.slice(heading.contentStart, heading.contentEnd)).toBe("Hello");
        expect(markerText(closed, heading)).toEqual(["# ", "#"]);

        const empty = find("#\n", "heading");
        expect(empty.level).toBe(1);
        expect(empty.contentStart).toBe(empty.contentEnd);
        expect(markerText("#\n", empty)).toEqual(["#"]);
    });

    it("strips angle-bracket destinations and keeps reference links without a resource", () => {
        const angled = find("[a](<https://example.com>)", "link");
        expect(angled.url).toBe("https://example.com");

        const source = "[text][id]\n\n[id]: https://example.com\n";
        const link = find(source, "link");
        expect(link.url).toBeUndefined();
        expect(link.alt).toBe("text");
        expect(markerText(source, link)).toEqual(["[", "]"]);
    });

    it("reads autolinks, literal urls, indented code, and an empty fence", () => {
        const autolink = find("<https://example.com>", "link");
        expect(autolink.url).toBe("https://example.com");
        expect(markerText("<https://example.com>", autolink)).toEqual(["<", ">"]);

        const literal = find("see https://example.com now", "link");
        expect(literal.url).toBe("https://example.com");
        expect(literal.markers).toEqual([]);

        const indented = find("    code\n", "codeBlock");
        expect(indented.language).toBe("");
        expect("    code\n".slice(indented.contentStart, indented.contentEnd)).toBe("    code");

        const fence = "```\n```\n";
        const block = find(fence, "codeBlock");
        expect(block.language).toBe("");
        expect(block.markers).toHaveLength(2);
        expect(fence.slice(block.contentStart, block.contentEnd)).toBe("\n```");
    });

    it("falls back when an inline code span has no data token", () => {
        const source = "`\n`";
        const code = find(source, "inlineCode");
        expect(code.contentStart).toBe(code.start);
        expect(code.contentEnd).toBe(code.end);
        expect(markerText(source, code)).toEqual(["`", "`"]);
    });

    it("falls back when tokens omit the pieces a construct usually has", () => {
        const source = "x".repeat(140);
        synthetic.events = [
            mark("enter", "data", 0, 0, false),
            mark("exit", "data", 0, 0, false),
            mark("enter", "strong", 0, 2),
            mark("enter", "strongSequence", 0, 2),
            mark("exit", "strongSequence", 0, 2),
            mark("exit", "strong", 0, 2),
            mark("enter", "strong", 10, 14),
            mark("enter", "strongSequence", 10, 12),
            mark("exit", "strongSequence", 10, 12),
            mark("enter", "strongSequence", 12, 14),
            mark("exit", "strongSequence", 12, 14),
            mark("exit", "strong", 10, 14),
            mark("enter", "atxHeading", 20, 21),
            mark("exit", "atxHeading", 20, 21),
            mark("enter", "image", 30, 40),
            mark("exit", "image", 30, 40),
            mark("enter", "link", 50, 60),
            mark("exit", "link", 50, 60),
            mark("enter", "autolink", 70, 80),
            mark("exit", "autolink", 70, 80),
            mark("enter", "codeFenced", 90, 95),
            mark("exit", "codeFenced", 90, 95),
            mark("enter", "table", 100, 110),
            mark("exit", "table", 100, 110),
            mark("enter", "table", 120, 130),
            mark("enter", "tableRow", 120, 130),
            mark("exit", "tableRow", 120, 130),
            mark("exit", "table", 120, 130),
            mark("enter", "dangling", 0, 0),
        ];
        const scopes = parseScopes(source);
        const strong = scopes.find((scope) => scope.kind === "strong");
        const image = scopes.find((scope) => scope.kind === "image");
        const link = scopes.find((scope) => scope.kind === "link" && scope.start === 50);
        const autolink = scopes.find((scope) => scope.kind === "link" && scope.start === 70);
        const code = scopes.find((scope) => scope.kind === "codeBlock");
        const table = scopes.find((scope) => scope.kind === "table");
        expect(scopes.some((scope) => scope.kind === "heading")).toBe(false);
        expect(strong && source.slice(strong.contentStart, strong.contentEnd)).toBe("");
        expect(image).toMatchObject({ alt: "", url: undefined, contentStart: 30, contentEnd: 30 });
        expect(link).toMatchObject({ alt: "", url: undefined, contentStart: 50, contentEnd: 60, markers: [] });
        expect(autolink?.url).toBe(source.slice(70, 80));
        expect(autolink?.markers).toEqual([]);
        expect(code).toMatchObject({ language: "", contentStart: 90, contentEnd: 95, markers: [] });
        expect(table).toMatchObject({ contentStart: 120, rows: [[]] });
    });
});
