import { describe, expect, it } from "vite-plus/test";
import { replacementTextForModifiedLineRange } from "./branchDiffLineDiff";

describe("replacementTextForModifiedLineRange", () => {
    it("replaces modified lines with the base version", () => {
        const baseLines = ["alpha", "beta", "gamma"];
        const modLines = ["alpha", "changed", "gamma"];
        const replacement = replacementTextForModifiedLineRange(baseLines, modLines, 1, 1, "\n");
        expect(replacement).toBe("beta");
    });

    it("removes inserted lines when reverting the selection", () => {
        const baseLines = ["alpha", "beta"];
        const modLines = ["alpha", "extra", "beta"];
        const replacement = replacementTextForModifiedLineRange(baseLines, modLines, 1, 1, "\n");
        expect(replacement).toBe("");
    });

    it("keeps unchanged selected lines aligned with the base version", () => {
        const baseLines = ["alpha", "beta", "gamma"];
        const modLines = ["alpha", "gamma"];
        const replacement = replacementTextForModifiedLineRange(baseLines, modLines, 1, 1, "\n");
        expect(replacement).toBe("gamma");
    });
});
