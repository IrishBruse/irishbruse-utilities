import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { layoutSelectionPieces, type SelectionBox } from "./selection";

const here = dirname(fileURLToPath(import.meta.url));

function box(top: number, height: number, styleHeight = "", styleBottom = "0px"): SelectionBox {
    return {
        top,
        height,
        styleTop: "0px",
        styleBottom,
        styleHeight,
    };
}

describe("selection highlight", () => {
    it("paints the selection on every selected line, including lines that are not headings", () => {
        const source = readFileSync(join(here, "decorations.ts"), "utf8");
        const body = source.slice(
            source.indexOf("private applySelectionHeights"),
            source.indexOf("private syncCurrentLine"),
        );
        expect(body).not.toMatch(/for \(const piece of pieces\) \{\s*piece\.style\.bottom = "";\s*piece\.style\.height = "";\s*\}/);
        expect(body).toContain("stretchesSelectionLine");

        const paragraph = box(80, 20);
        const heading = box(40, 20);
        layoutSelectionPieces(
            [paragraph, heading],
            [
                { top: 40, height: 34, stretchToLineHeight: true },
                { top: 80, height: 20, stretchToLineHeight: false },
            ],
        );
        expect(paragraph.styleBottom).toBe("0px");
        expect(paragraph.styleHeight).toBe("");
        expect(heading.styleBottom).toBe("auto");
        expect(heading.styleHeight).toBe("34px");

        const stale = box(10, 34, "34px", "auto");
        layoutSelectionPieces([stale], [{ top: 10, height: 20, stretchToLineHeight: false }]);
        expect(stale.styleBottom).toBe("0px");
        expect(stale.styleHeight).toBe("");

        const listEnd = box(60, 20);
        layoutSelectionPieces(
            [listEnd],
            [{ top: 60, height: 24, stretchToLineHeight: true }],
        );
        expect(listEnd.styleHeight).toBe("24px");
    });
});
