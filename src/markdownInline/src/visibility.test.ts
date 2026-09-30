import { describe, expect, it } from "vitest";
import type { CursorContext, Scope } from "./types";
import { markerVisibility, showsFormattedContent } from "./visibility";

function cursor(head: number, lineStart: number, lineEnd: number, anchor = head): CursorContext {
    return { selectionFrom: anchor, selectionTo: head, lineStart, lineEnd };
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
        expect(markerVisibility(strong, marker, cursor(20, 10, 30))).toBe("hidden");
        expect(markerVisibility(strong, marker, cursor(9, 0, 10))).toBe("ghost");
        expect(showsFormattedContent(strong, cursor(9, 0, 10))).toBe(true);
    });

    it("shows a construct raw when the cursor is inside it", () => {
        const marker = strong.markers[0]!;
        expect(markerVisibility(strong, marker, cursor(3, 0, 10))).toBe("raw");
        expect(showsFormattedContent(strong, cursor(3, 0, 10))).toBe(false);
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
        expect(markerVisibility(heading, heading.markers[0]!, cursor(4, 0, 7))).toBe("raw");
        expect(showsFormattedContent(heading, cursor(4, 0, 7))).toBe(false);
        expect(markerVisibility(heading, heading.markers[0]!, cursor(20, 10, 30))).toBe("hidden");
        expect(showsFormattedContent(heading, cursor(20, 10, 30))).toBe(true);
    });

    it("keeps list and quote markers rendered unless the cursor is on them", () => {
        const list: Scope = {
            kind: "listMarker",
            start: 0,
            end: 2,
            contentStart: 2,
            contentEnd: 2,
            markers: [{ start: 0, end: 2 }],
        };
        const quote: Scope = {
            kind: "blockquoteMarker",
            start: 0,
            end: 2,
            contentStart: 2,
            contentEnd: 2,
            markers: [{ start: 0, end: 2 }],
        };
        expect(markerVisibility(list, list.markers[0]!, cursor(5, 0, 12))).toBe("hidden");
        expect(markerVisibility(list, list.markers[0]!, cursor(0, 0, 12))).toBe("raw");
        expect(markerVisibility(quote, quote.markers[0]!, cursor(4, 0, 10))).toBe("hidden");
        expect(markerVisibility(quote, quote.markers[0]!, cursor(1, 0, 10))).toBe("raw");
    });

    it("shows an image as source only while the cursor is inside it", () => {
        const image: Scope = {
            kind: "image",
            start: 0,
            end: 16,
            contentStart: 2,
            contentEnd: 5,
            markers: [{ start: 0, end: 16 }],
            alt: "Dot",
            url: "dot.png",
        };
        expect(markerVisibility(image, image.markers[0]!, cursor(4, 0, 20))).toBe("raw");
        expect(markerVisibility(image, image.markers[0]!, cursor(18, 0, 20))).toBe("hidden");
    });
});
