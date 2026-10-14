import { describe, expect, it } from "vite-plus/test";
import type { Scope } from "../../../document/types";
import { rawMarkerRanges } from "../raw";
import { styleClass, styleRange } from "../style";

const text = "*italic*";

function emphasis(): Scope {
    return {
        kind: "emphasis",
        start: 0,
        end: text.length,
        contentStart: 1,
        contentEnd: 7,
        markers: [
            { start: 0, end: 1 },
            { start: 7, end: 8 },
        ],
    };
}

describe("emphasis", () => {
    it("styles the word and leaves the markers without a class", () => {
        const scope = emphasis();
        expect(text.slice(1, 7)).toBe("italic");
        expect(styleClass(scope)).toBe("inline-md-em");
        expect(styleRange(scope)).toEqual({ start: 1, end: 7 });
        expect(rawMarkerRanges(scope)).toEqual(scope.markers);
        const painted = styleRange(scope);
        for (const marker of rawMarkerRanges(scope)) {
            expect(marker.end <= painted!.start || marker.start >= painted!.end).toBe(true);
        }
        expect(styleClass({ ...scope, kind: "strong" })).toBeUndefined();
    });
});
