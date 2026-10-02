import { describe, expect, it } from "vitest";
import { revealMarker, revealMermaid, showFormatted } from "./reveal";
import type { CursorContext, Scope } from "./types";
import { markerVisibility, showsFormattedContent } from "./visibility";

function cursor(head: number, lineStart: number, lineEnd: number, anchor = head, eolLength = 1): CursorContext {
    return { selectionFrom: anchor, selectionTo: head, lineStart, lineEnd, eolLength };
}

function markerLine(lineStart: number, lineEnd: number) {
    return { lineStart, lineEnd };
}

describe("revealMarker", () => {
    it("keeps a find hit on a hidden table as source", () => {
        const table: Scope = {
            kind: "table",
            start: 0,
            end: 40,
            contentStart: 2,
            contentEnd: 6,
            markers: [{ start: 0, end: 40 }],
            rows: [[{ start: 2, end: 6 }]],
        };
        const away = cursor(50, 40, 60);
        const line = markerLine(0, 1);
        expect(markerVisibility(table, table.markers[0]!, away, line)).toBe("hidden");
        expect(revealMarker({
            scope: table,
            marker: table.markers[0]!,
            cursor: away,
            markerLine: line,
            findHit: true,
            frontMatterEnd: undefined,
            singleLine: true,
        })).toBe("raw");
    });

    it("zones a table when the caret is away and nothing is found", () => {
        const table: Scope = {
            kind: "table",
            start: 0,
            end: 40,
            contentStart: 2,
            contentEnd: 6,
            markers: [{ start: 0, end: 40 }],
            rows: [[{ start: 2, end: 6 }]],
        };
        const away = cursor(50, 40, 60);
        const line = markerLine(0, 1);
        expect(markerVisibility(table, table.markers[0]!, away, line)).toBe("hidden");
        expect(revealMarker({
            scope: table,
            marker: table.markers[0]!,
            cursor: away,
            markerLine: line,
            findHit: false,
            frontMatterEnd: undefined,
            singleLine: false,
        })).toBe("zone");
    });

    it("occupies a hidden thematic break inside front matter", () => {
        const rule: Scope = {
            kind: "thematicBreak",
            start: 10,
            end: 14,
            contentStart: 10,
            contentEnd: 13,
            markers: [{ start: 10, end: 14 }],
        };
        const away = cursor(40, 30, 50);
        const line = markerLine(0, 1);
        expect(markerVisibility(rule, rule.markers[0]!, away, line)).toBe("hidden");
        expect(revealMarker({
            scope: rule,
            marker: rule.markers[0]!,
            cursor: away,
            markerLine: line,
            findHit: false,
            frontMatterEnd: 20,
            singleLine: true,
        })).toBe("occupy");
    });

    it("occupies a hidden thematic break inside front matter and zones one outside it", () => {
        const rule: Scope = {
            kind: "thematicBreak",
            start: 10,
            end: 14,
            contentStart: 10,
            contentEnd: 13,
            markers: [{ start: 10, end: 14 }],
        };
        const away = cursor(40, 30, 50);
        const line = markerLine(0, 1);
        expect(markerVisibility(rule, rule.markers[0]!, away, line)).toBe("hidden");
        expect(revealMarker({
            scope: rule,
            marker: rule.markers[0]!,
            cursor: away,
            markerLine: line,
            findHit: false,
            frontMatterEnd: 20,
            singleLine: true,
        })).toBe("occupy");
        expect(revealMarker({
            scope: rule,
            marker: rule.markers[0]!,
            cursor: away,
            markerLine: line,
            findHit: false,
            frontMatterEnd: undefined,
            singleLine: true,
        })).toBe("zone");
    });

    it("zones a thematic break outside front matter when it covers one line", () => {
        const rule: Scope = {
            kind: "thematicBreak",
            start: 10,
            end: 14,
            contentStart: 10,
            contentEnd: 13,
            markers: [{ start: 10, end: 14 }],
        };
        const away = cursor(40, 30, 50);
        expect(revealMarker({
            scope: rule,
            marker: rule.markers[0]!,
            cursor: away,
            markerLine: markerLine(0, 1),
            findHit: false,
            frontMatterEnd: undefined,
            singleLine: true,
        })).toBe("zone");
    });

    it("hides an image that does not cover a single line", () => {
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
        const away = cursor(50, 40, 60);
        const line = markerLine(0, 1);
        expect(markerVisibility(image, image.markers[0]!, away, line)).toBe("hidden");
        expect(revealMarker({
            scope: image,
            marker: image.markers[0]!,
            cursor: away,
            markerLine: line,
            findHit: false,
            frontMatterEnd: undefined,
            singleLine: false,
        })).toBe("hidden");
    });
});

describe("showFormatted", () => {
    it("drops formatted content while a find hit is active", () => {
        const heading: Scope = {
            kind: "heading",
            start: 0,
            end: 7,
            contentStart: 2,
            contentEnd: 7,
            markers: [{ start: 0, end: 2 }],
            level: 1,
        };
        const away = cursor(20, 10, 30);
        expect(showsFormattedContent(heading, away)).toBe(true);
        expect(showFormatted(heading, away, true)).toBe(false);
        expect(showFormatted(heading, away, false)).toBe(true);
    });
});

describe("revealMermaid", () => {
    const diagram: Scope = {
        kind: "codeBlock",
        start: 0,
        end: 40,
        contentStart: 10,
        contentEnd: 30,
        markers: [{ start: 0, end: 10 }],
        language: "mermaid",
    };

    it("returns source when the selection overlaps or a find hits", () => {
        expect(revealMermaid(diagram, cursor(12, 0, 40), false)).toBe("raw");
        expect(revealMermaid(diagram, cursor(80, 50, 90), true)).toBe("raw");
        expect(revealMermaid(diagram, cursor(80, 50, 90, 0), false)).toBe("raw");
    });

    it("returns a zone when the caret is away and nothing is found", () => {
        expect(revealMermaid(diagram, cursor(80, 50, 90), false)).toBe("zone");
    });
});
