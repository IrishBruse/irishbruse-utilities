import { describe, expect, it } from "vitest";
import { headingAscentPx, headingGapPx, headingLineHeightPx, headingSelectionPadPx } from "./headingGap";

describe("headingGapPx", () => {
    it("grows with heading level scale and editor font size", () => {
        expect(headingGapPx(1, 14)).toBeGreaterThan(headingGapPx(2, 14));
        expect(headingGapPx(1, 20)).toBeGreaterThan(headingGapPx(1, 14));
    });

    it("returns zero for body-sized headings", () => {
        expect(headingGapPx(5, 14)).toBe(0);
        expect(headingGapPx(6, 14)).toBe(0);
    });
});

describe("headingAscentPx", () => {
    it("returns zero", () => {
        expect(headingAscentPx(1, 14, 20)).toBe(0);
    });
});

describe("headingLineHeightPx", () => {
    it("returns the editor line height", () => {
        expect(headingLineHeightPx(2, 14, 20)).toBe(20);
    });
});

describe("headingSelectionPadPx", () => {
    it("scales with font size", () => {
        expect(headingSelectionPadPx(14)).toBe(6);
        expect(headingSelectionPadPx(0)).toBe(0);
    });
});
