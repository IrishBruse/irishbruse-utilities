import { describe, expect, it } from "vite-plus/test";
import type { Scope } from "../../../document/types";
import { rawMarkerRanges } from "../raw";
import { fenceLanguageInjectClass, fenceLineClass, languageInjectText, lineClass } from "../style";

function codeBlock(): Scope {
    return {
        kind: "codeBlock",
        start: 0,
        end: 20,
        contentStart: 8,
        contentEnd: 16,
        language: "ts",
        markers: [
            { start: 0, end: 5 },
            { start: 17, end: 20 },
        ],
    };
}

describe("fence line class", () => {
    it("marks code block lines", () => {
        expect(lineClass(codeBlock())).toBe(fenceLineClass);
        expect(lineClass({ ...codeBlock(), kind: "heading" })).toBeUndefined();
    });
});

describe("fence language inject", () => {
    it("uses the scope language and falls back to text", () => {
        expect(languageInjectText(codeBlock())).toBe("ts");
        expect(languageInjectText({ ...codeBlock(), language: "" })).toBe("text");
        expect(languageInjectText({ ...codeBlock(), language: undefined })).toBe("text");
        expect(fenceLanguageInjectClass).toBe("inline-md-lang");
    });
});

describe("fence raw markers", () => {
    it("returns fence markers for a code block", () => {
        const scope = codeBlock();
        expect(rawMarkerRanges(scope)).toEqual(scope.markers);
        expect(rawMarkerRanges({ ...scope, kind: "inlineCode" })).toEqual([]);
    });
});
