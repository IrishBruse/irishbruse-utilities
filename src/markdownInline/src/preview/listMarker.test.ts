import { describe, expect, it } from "vitest";
import { parseScopes } from "../document/scopes";
import { listMarkerBulletClass, listMarkerIndentColumns, listMarkerIsTask } from "./listItemGap";

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

describe("listMarkerIsTask", () => {
    it("is true when the marker is followed by a task checkbox", () => {
        const scopes = parseScopes("- [ ] Task\n");
        const marker = scopes.find((scope) => scope.kind === "listMarker")?.markers[0];
        expect(marker).toBeDefined();
        expect(listMarkerIsTask(scopes, marker!.end)).toBe(true);
    });

    it("is false for a normal bullet item", () => {
        const scopes = parseScopes("- item\n");
        const marker = scopes.find((scope) => scope.kind === "listMarker")?.markers[0];
        expect(marker).toBeDefined();
        expect(listMarkerIsTask(scopes, marker!.end)).toBe(false);
    });
});
