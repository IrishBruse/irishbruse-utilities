import { describe, expect, it } from "vitest";
import { toMonacoColor } from "./monacoColor";

describe("toMonacoColor", () => {
    it("keeps hex colors Monaco can parse", () => {
        expect(toMonacoColor("#99bbff0a")).toBe("#99bbff0a");
        expect(toMonacoColor("#3e4451")).toBe("#3e4451");
        expect(toMonacoColor("#abc")).toBe("#aabbcc");
    });

    it("turns an rgba current-line color into 8-digit hex", () => {
        expect(toMonacoColor("rgba(153, 187, 255, 0.04)")).toBe("#99bbff0a");
        expect(toMonacoColor("rgba(153, 187, 255, 0.0392156862745098)")).toBe("#99bbff0a");
    });

    it("drops opaque alpha", () => {
        expect(toMonacoColor("rgb(62, 68, 81)")).toBe("#3e4451");
        expect(toMonacoColor("rgba(62, 68, 81, 1)")).toBe("#3e4451");
    });
});
