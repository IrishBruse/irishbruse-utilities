import { describe, expect, it } from "vitest";
import { toMonacoColor } from "./color";

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

    it("accepts percent channels and alpha", () => {
        expect(toMonacoColor("rgb(100%, 0%, 0%)")).toBe("#ff0000");
        expect(toMonacoColor("rgba(0, 0, 0, 50%)")).toBe("#00000080");
    });

    it("rejects values Monaco cannot parse", () => {
        expect(toMonacoColor("blue")).toBeUndefined();
        expect(toMonacoColor("rgb(nope, 1, 2)")).toBeUndefined();
        expect(toMonacoColor("rgba(1, 2, 3, nope)")).toBeUndefined();
    });
});
