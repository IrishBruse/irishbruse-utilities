import { describe, expect, it } from "vitest";
import { applyHeadingFontScales, headingLineHeightMultiplier, headingSelectionPadPx } from "./headingLayout";

describe("applyHeadingFontScales", () => {
    it("writes a scale for each heading level", () => {
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
        expect(properties.get("--ib-md-h2-scale")).toBe("1.4");
        expect(properties.get("--ib-md-h5-scale")).toBe("1");
        expect(properties.get("--ib-md-h6-scale")).toBe("0.85");
    });
});

describe("headingLineHeightMultiplier", () => {
    it("uses the heading scale for large headings", () => {
        expect(headingLineHeightMultiplier(1)).toBe(1.5);
        expect(headingLineHeightMultiplier(2)).toBe(1.4);
    });

    it("returns undefined for body-sized headings", () => {
        expect(headingLineHeightMultiplier(5)).toBeUndefined();
        expect(headingLineHeightMultiplier(6)).toBeUndefined();
    });
});

describe("headingSelectionPadPx", () => {
    it("scales with font size", () => {
        expect(headingSelectionPadPx(14)).toBe(6);
        expect(headingSelectionPadPx(0)).toBe(0);
    });
});
