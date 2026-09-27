import { describe, expect, it } from "vitest";
import { highlightMarkdownSource, lineNumberText } from "./markdownSourceHighlight";

function kinds(text: string): string[] {
    return highlightMarkdownSource(text).map((token) => `${token.kind}:${text.slice(token.start, token.endExclusive)}`);
}

describe("highlightMarkdownSource", () => {
    it("colors a heading, bold text, and the two parts of a link", () => {
        const text = "# Links\n\nOpen with **Markdown Editor**. See [showcase.md](./showcase.md).";
        expect(kinds(text)).toEqual([
            "heading:# Links",
            "bold:**Markdown Editor**",
            "linkLabel:[showcase.md]",
            "link:./showcase.md",
        ]);
    });

    it("colors each heading level and leaves the marker with the heading", () => {
        expect(kinds("## Inline links")).toEqual(["heading:## Inline links"]);
    });

    it("colors angle-bracket and bare URLs", () => {
        const text = "- <https://example.com>\n- https://example.com";
        expect(kinds(text)).toEqual(["link:<https://example.com>", "link:https://example.com"]);
    });

    it("colors a link title separately from the URL", () => {
        const text = '[Example](https://example.com "Example title")';
        expect(kinds(text)).toEqual(["linkLabel:[Example]", "link:https://example.com"]);
    });

    it("colors reference links and definitions", () => {
        const text = "See [first][demo].\n\n[demo]: https://example.com/demo";
        expect(kinds(text)).toEqual([
            "linkLabel:[first][demo]",
            "linkLabel:[demo]",
            "link:https://example.com/demo",
        ]);
    });

    it("does not treat a heading inside a fence as a heading", () => {
        const text = "```md\n# Not a heading\n```";
        expect(kinds(text).every((token) => token.startsWith("code:"))).toBe(true);
        expect(kinds(text).some((token) => token.startsWith("heading:"))).toBe(false);
    });

    it("keeps inline code out of bold and link coloring", () => {
        expect(kinds("Use `**not bold**` and `https://example.com`.")).toEqual([
            "code:`**not bold**`",
            "code:`https://example.com`",
        ]);
    });
});

describe("lineNumberText", () => {
    it("numbers each line, including a trailing empty line", () => {
        expect(lineNumberText("a\nb\n")).toBe("1\n2\n3");
        expect(lineNumberText("")).toBe("1");
    });
});
