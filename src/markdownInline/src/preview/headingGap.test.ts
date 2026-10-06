import { describe, expect, it } from "vitest";
import { headingGapPx } from "./headingGap";

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
