import { describe, expect, it } from "vitest";
import {
    applyHeadingFontScales,
    HEADING_LINE_HEIGHT_MULTIPLIER,
    headingFontScale,
    headingGapPx,
    headingLineHeightMultiplier,
    headingSelectionPadPx,
    headingViewLineHeightPx,
} from "./headingGap";

describe("headingFontScale", () => {
    it("matches HEADING_SCALE for each level", () => {
        expect(headingFontScale(1)).toBe(1.5);
        expect(headingFontScale(6)).toBe(0.85);
    });
});

describe("applyHeadingFontScales", () => {
    it("writes scale custom properties on the root", () => {
        const properties = new Map<string, string>();
        const root = {
            style: {
                setProperty(property: string, propertyValue: string) {
                    properties.set(property, propertyValue);
                },
            },
        } as HTMLElement;
        applyHeadingFontScales(root);
        expect(properties.get("--ib-md-h1-scale")).toBe("1.5");
        expect(properties.get("--ib-md-h6-scale")).toBe("0.85");
    });
});

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

describe("headingLineHeightMultiplier", () => {
    it("scales line height with heading font scale", () => {
        expect(headingLineHeightMultiplier(1)).toBe(headingFontScale(1) * HEADING_LINE_HEIGHT_MULTIPLIER);
        expect(headingLineHeightMultiplier(2)).toBe(headingFontScale(2) * HEADING_LINE_HEIGHT_MULTIPLIER);
    });

    it("returns undefined for body-sized headings", () => {
        expect(headingLineHeightMultiplier(5)).toBeUndefined();
        expect(headingLineHeightMultiplier(6)).toBeUndefined();
    });
});

describe("headingViewLineHeightPx", () => {
    it("matches body height for body-sized headings", () => {
        expect(headingViewLineHeightPx(16, 5)).toBe(16);
        expect(headingViewLineHeightPx(16, 6)).toBe(16);
    });

    it("scales body line height for large headings", () => {
        expect(headingViewLineHeightPx(16, 1)).toBe(24);
        expect(headingViewLineHeightPx(16, 2)).toBe(22);
    });
});

describe("headingSelectionPadPx", () => {
    it("scales with font size", () => {
        expect(headingSelectionPadPx(14)).toBe(6);
        expect(headingSelectionPadPx(0)).toBe(0);
    });
});
