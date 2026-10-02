import { describe, expect, it } from "vitest";
import { listMarkerBulletClass, listMarkerIndentColumns } from "./listItemGap";

describe("listMarkerIndentColumns", () => {
    it("counts leading spaces before the marker column", () => {
        expect(listMarkerIndentColumns("- item", 1, 4)).toBe(0);
        expect(listMarkerIndentColumns("  - nested", 3, 4)).toBe(2);
        expect(listMarkerIndentColumns("\t- tab", 2, 4)).toBe(4);
    });
});

describe("listMarkerBulletClass", () => {
    it("includes the indent suffix", () => {
        expect(listMarkerBulletClass(2)).toBe("inline-md-list-bullet inline-md-list-indent-2");
        expect(listMarkerBulletClass(30)).toBe("inline-md-list-bullet inline-md-list-indent-24");
    });
});
