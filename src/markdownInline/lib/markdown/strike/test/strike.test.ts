import { describe, expect, it } from "vite-plus/test";
import type { Scope } from "../../../document/types";
import { rawMarkerRanges } from "../raw";
import { styleClass, styleRange } from "../style";

const text = "~~gone~~";

function strike(): Scope {
    return {
        kind: "strikethrough",
        start: 0,
        end: text.length,
        contentStart: 2,
        contentEnd: 6,
        markers: [
            { start: 0, end: 2 },
            { start: 6, end: 8 },
        ],
    };
}

describe("strike", () => {
    it("styles the word and leaves the markers without a class", () => {
        const scope = strike();
        expect(text.slice(2, 6)).toBe("gone");
        expect(styleClass(scope)).toBe("inline-md-strike");
        expect(styleRange(scope)).toEqual({ start: 2, end: 6 });
        expect(rawMarkerRanges(scope)).toEqual(scope.markers);
        const painted = styleRange(scope);
        for (const marker of rawMarkerRanges(scope)) {
            expect(marker.end <= painted!.start || marker.start >= painted!.end).toBe(true);
        }
        expect(styleClass({ ...scope, kind: "strong" })).toBeUndefined();
    });
});
