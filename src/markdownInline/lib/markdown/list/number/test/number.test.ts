import { describe, expect, it } from "vite-plus/test";
import { listGapAfterClass } from "../../gap";
import { orderedListPrefix } from "../raw";
import { numberGapClass } from "../style";

describe("orderedListPrefix", () => {
    it("keeps the number in the source line", () => {
        const line = "1. Ordered one";
        const prefix = orderedListPrefix(line);
        expect(prefix).toBe("1. ");
        expect(line.slice(prefix!.length)).toBe("Ordered one");
        expect(orderedListPrefix("  12) item")).toBe("  12) ");
        expect(orderedListPrefix("- item")).toBeUndefined();
    });
});

describe("numberGapClass", () => {
    it("uses the shared list gap class", () => {
        expect(numberGapClass).toBe(listGapAfterClass);
        expect(numberGapClass).toBe("inline-md-list-gap-after");
    });
});
