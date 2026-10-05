import { describe, expect, it } from "vitest";
import { parseScopes } from "./document/scopes";
import type { CursorContext, Scope } from "./document/types";
import { markerVisibility, showsFormattedContent } from "./visibility";

function cursor(head: number, lineStart: number, lineEnd: number, anchor = head, eolLength = 1): CursorContext {
    return { selectionFrom: anchor, selectionTo: head, lineStart, lineEnd, eolLength };
}

function markerLine(lineStart: number, lineEnd: number) {
    return { lineStart, lineEnd };
}

const strong: Scope = {
    kind: "strong",
    start: 0,
    end: 8,
    contentStart: 2,
    contentEnd: 6,
    markers: [
        { start: 0, end: 2 },
        { start: 6, end: 8 },
    ],
};

describe("markerVisibility", () => {
    it("hides strong markers off the cursor line and ghosts them on the line", () => {
        const marker = strong.markers[0]!;
        expect(markerVisibility(strong, marker, cursor(20, 10, 30), markerLine(0, 1))).toBe("hidden");
        expect(markerVisibility(strong, marker, cursor(9, 0, 10), markerLine(0, 1))).toBe("ghost");
        expect(showsFormattedContent(strong, cursor(9, 0, 10))).toBe(true);
    });

    it("shows a construct raw when the cursor is inside it", () => {
        const marker = strong.markers[0]!;
        expect(markerVisibility(strong, marker, cursor(3, 0, 10), markerLine(0, 1))).toBe("raw");
        expect(showsFormattedContent(strong, cursor(3, 0, 10))).toBe(false);
    });

    it("shows a rule as source when a selection covers it", () => {
        const rule: Scope = {
            kind: "thematicBreak",
            start: 10,
            end: 14,
            contentStart: 10,
            contentEnd: 13,
            markers: [{ start: 10, end: 14 }],
        };
        expect(markerVisibility(rule, rule.markers[0]!, cursor(20, 16, 30, 0), markerLine(0, 1))).toBe("raw");
        expect(markerVisibility(rule, rule.markers[0]!, cursor(40, 30, 50), markerLine(0, 1))).toBe("hidden");
    });

    it("drops heading style and shows hashes when the cursor line overlaps", () => {
        const heading: Scope = {
            kind: "heading",
            start: 0,
            end: 7,
            contentStart: 2,
            contentEnd: 7,
            markers: [{ start: 0, end: 2 }],
            level: 1,
        };
        expect(markerVisibility(heading, heading.markers[0]!, cursor(4, 0, 7), markerLine(0, 1))).toBe("raw");
        expect(showsFormattedContent(heading, cursor(4, 0, 7))).toBe(false);
        expect(markerVisibility(heading, heading.markers[0]!, cursor(20, 10, 30), markerLine(0, 1))).toBe("hidden");
        expect(showsFormattedContent(heading, cursor(20, 10, 30))).toBe(true);
    });

    it("shows heading hashes when a multi-line selection covers the heading", () => {
        const heading: Scope = {
            kind: "heading",
            start: 10,
            end: 30,
            contentStart: 12,
            contentEnd: 30,
            markers: [{ start: 10, end: 12 }],
            level: 1,
        };
        const drag = cursor(500, 400, 450, 0);
        expect(markerVisibility(heading, heading.markers[0]!, drag, markerLine(0, 1))).toBe("raw");
        expect(showsFormattedContent(heading, drag)).toBe(false);
    });

    it("keeps list markers rendered unless the cursor is on them", () => {
        const list: Scope = {
            kind: "listMarker",
            start: 0,
            end: 2,
            contentStart: 2,
            contentEnd: 2,
            markers: [{ start: 0, end: 2 }],
        };
        expect(markerVisibility(list, list.markers[0]!, cursor(5, 0, 12), markerLine(0, 12))).toBe("hidden");
        expect(markerVisibility(list, list.markers[0]!, cursor(0, 0, 12), markerLine(0, 12))).toBe("raw");
    });

    it("hides a quote mark unless the cursor is touching it", () => {
        const quote: Scope = {
            kind: "blockquoteMarker",
            start: 0,
            end: 2,
            contentStart: 2,
            contentEnd: 2,
            markers: [{ start: 0, end: 2 }],
        };
        expect(markerVisibility(quote, quote.markers[0]!, cursor(4, 0, 10), markerLine(0, 10))).toBe("hidden");
        expect(markerVisibility(quote, quote.markers[0]!, cursor(2, 0, 10), markerLine(0, 10))).toBe("hidden");
        expect(markerVisibility(quote, quote.markers[0]!, cursor(1, 0, 10), markerLine(0, 10))).toBe("raw");
        expect(markerVisibility(quote, quote.markers[0]!, cursor(0, 0, 10), markerLine(0, 10))).toBe("raw");
        expect(markerVisibility(quote, quote.markers[0]!, cursor(16, 8, 20, 8), markerLine(0, 8))).toBe("hidden");
    });

    it("shows list, task, and quote markers when a selection overlaps the marker or its line", () => {
        const list: Scope = {
            kind: "listMarker",
            start: 0,
            end: 2,
            contentStart: 2,
            contentEnd: 2,
            markers: [{ start: 0, end: 2 }],
        };
        const task: Scope = {
            kind: "task",
            start: 2,
            end: 5,
            contentStart: 5,
            contentEnd: 5,
            markers: [{ start: 2, end: 5 }],
            checked: false,
        };
        const quote: Scope = {
            kind: "blockquoteMarker",
            start: 0,
            end: 2,
            contentStart: 2,
            contentEnd: 2,
            markers: [{ start: 0, end: 2 }],
        };
        expect(markerVisibility(list, list.markers[0]!, cursor(40, 30, 50, 0), markerLine(0, 12))).toBe("raw");
        expect(markerVisibility(list, list.markers[0]!, cursor(12, 0, 20, 4), markerLine(0, 20))).toBe("raw");
        expect(markerVisibility(list, list.markers[0]!, cursor(30, 20, 40, 10), markerLine(0, 10))).toBe("hidden");
        expect(markerVisibility(task, task.markers[0]!, cursor(20, 10, 24, 0), markerLine(0, 20))).toBe("raw");
        expect(markerVisibility(task, task.markers[0]!, cursor(12, 0, 20, 6), markerLine(0, 20))).toBe("raw");
        expect(markerVisibility(quote, quote.markers[0]!, cursor(10, 0, 12, 0), markerLine(0, 12))).toBe("raw");
        expect(markerVisibility(quote, quote.markers[0]!, cursor(12, 0, 16, 4), markerLine(0, 16))).toBe("raw");
        expect(markerVisibility(quote, quote.markers[0]!, cursor(30, 20, 40, 20), markerLine(0, 8))).toBe("hidden");
    });

    it("shows an image as source when the caret is inside it or on its line", () => {
        const image: Scope = {
            kind: "image",
            start: 20,
            end: 36,
            contentStart: 22,
            contentEnd: 25,
            markers: [{ start: 20, end: 36 }],
            alt: "Dot",
            url: "dot.png",
        };
        expect(markerVisibility(image, image.markers[0]!, cursor(24, 20, 40), markerLine(0, 1))).toBe("raw");
        expect(markerVisibility(image, image.markers[0]!, cursor(20, 20, 40), markerLine(0, 1))).toBe("raw");
        expect(markerVisibility(image, image.markers[0]!, cursor(36, 20, 40), markerLine(0, 1))).toBe("raw");
        expect(markerVisibility(image, image.markers[0]!, cursor(10, 0, 19), markerLine(0, 1))).toBe("hidden");
        expect(markerVisibility(image, image.markers[0]!, cursor(10, 0, 18), markerLine(0, 1))).toBe("hidden");
        expect(markerVisibility(image, image.markers[0]!, cursor(10, 0, 18, 10, 2), markerLine(0, 1))).toBe("hidden");
        expect(markerVisibility(image, image.markers[0]!, cursor(10, 0, 17), markerLine(0, 1))).toBe("hidden");
        expect(markerVisibility(image, image.markers[0]!, cursor(50, 40, 60), markerLine(0, 1))).toBe("hidden");
        expect(markerVisibility(image, image.markers[0]!, cursor(50, 40, 60, 0), markerLine(0, 1))).toBe("raw");
    });

    it("keeps an image previewed when the caret is on a rule two lines above it", () => {
        const source = "---\n\n![Dot](https://www.w3.org/Icons/valid-xhtml10)\n";
        const image = parseScopes(source).find((scope) => scope.kind === "image");
        expect(image).toBeDefined();
        const ruleEnd = source.indexOf("\n");
        expect(markerVisibility(image!, image!.markers[0]!, cursor(0, 0, ruleEnd), markerLine(0, 1))).toBe("hidden");
    });

    it("keeps an image previewed when the caret is on the blank line before it", () => {
        const source = "---\n\n![Dot](https://www.w3.org/Icons/valid-xhtml10)\n";
        const image = parseScopes(source).find((scope) => scope.kind === "image");
        expect(image).toBeDefined();
        const blank = source.indexOf("\n") + 1;
        expect(markerVisibility(image!, image!.markers[0]!, cursor(blank, blank, blank), markerLine(0, 1))).toBe("hidden");
    });

    it("shows a table as source only while the cursor is inside it", () => {
        const table: Scope = {
            kind: "table",
            start: 0,
            end: 40,
            contentStart: 2,
            contentEnd: 6,
            markers: [{ start: 0, end: 40 }],
            rows: [[{ start: 2, end: 6 }]],
        };
        expect(markerVisibility(table, table.markers[0]!, cursor(0, 0, 20), markerLine(0, 1))).toBe("raw");
        expect(markerVisibility(table, table.markers[0]!, cursor(4, 0, 20), markerLine(0, 1))).toBe("raw");
        expect(showsFormattedContent(table, cursor(4, 0, 20))).toBe(false);
        expect(markerVisibility(table, table.markers[0]!, cursor(40, 40, 60), markerLine(0, 1))).toBe("hidden");
        expect(markerVisibility(table, table.markers[0]!, cursor(50, 40, 60), markerLine(0, 1))).toBe("hidden");
        expect(showsFormattedContent(table, cursor(50, 40, 60))).toBe(false);
    });

    it("shows a table as source when the caret line overlaps it or sits on the line before", () => {
        const table: Scope = {
            kind: "table",
            start: 30,
            end: 70,
            contentStart: 32,
            contentEnd: 36,
            markers: [{ start: 30, end: 70 }],
            rows: [[{ start: 32, end: 36 }]],
        };
        expect(markerVisibility(table, table.markers[0]!, cursor(40, 30, 70), markerLine(0, 1))).toBe("raw");
        expect(markerVisibility(table, table.markers[0]!, cursor(30, 30, 70), markerLine(0, 1))).toBe("raw");
        expect(markerVisibility(table, table.markers[0]!, cursor(10, 0, 29), markerLine(0, 1))).toBe("raw");
        expect(markerVisibility(table, table.markers[0]!, cursor(10, 0, 28), markerLine(0, 1))).toBe("hidden");
        expect(markerVisibility(table, table.markers[0]!, cursor(10, 0, 28, 10, 2), markerLine(0, 1))).toBe("raw");
        expect(markerVisibility(table, table.markers[0]!, cursor(10, 0, 27), markerLine(0, 1))).toBe("hidden");
        expect(markerVisibility(table, table.markers[0]!, cursor(90, 80, 100), markerLine(0, 1))).toBe("hidden");
        expect(markerVisibility(table, table.markers[0]!, cursor(90, 80, 100, 0), markerLine(0, 1))).toBe("raw");
        expect(markerVisibility(table, table.markers[0]!, cursor(5, 0, 10, 0), markerLine(0, 1))).toBe("hidden");
    });
});

describe("showsFormattedContent", () => {
    it("keeps code and quotes formatted and leaves images raw", () => {
        const block: Scope = {
            kind: "codeBlock",
            start: 0,
            end: 10,
            contentStart: 4,
            contentEnd: 8,
            markers: [],
            language: "",
        };
        const quote: Scope = {
            kind: "blockquote",
            start: 0,
            end: 8,
            contentStart: 0,
            contentEnd: 8,
            markers: [],
        };
        const image: Scope = {
            kind: "image",
            start: 0,
            end: 12,
            contentStart: 2,
            contentEnd: 5,
            markers: [{ start: 0, end: 12 }],
            alt: "Dot",
            url: "dot.png",
        };
        const away = cursor(40, 20, 30);
        expect(showsFormattedContent(block, away)).toBe(true);
        expect(showsFormattedContent(quote, cursor(2, 0, 8))).toBe(true);
        expect(showsFormattedContent(image, away)).toBe(false);
    });
});
