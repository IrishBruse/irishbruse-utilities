import { describe, expect, it, beforeEach } from "vitest";
import { Uri } from "vscode";
import { clearBranchDiffWorkingTreeFiles, setBranchDiffWorkingTreeFiles } from "./branchDiffFiles";
import { isReviewCommentableDocument, reviewCommentingRanges } from "./reviewCommentingRanges";

describe("isReviewCommentableDocument", () => {
    beforeEach(() => {
        clearBranchDiffWorkingTreeFiles();
    });

    it("allows git scheme documents", () => {
        expect(isReviewCommentableDocument(Uri.from({ scheme: "git", path: "/a.ts" }))).toBe(true);
    });

    it("allows working tree files from an open branch diff", () => {
        const filePath = "/repo/src/a.ts";
        setBranchDiffWorkingTreeFiles([filePath]);
        expect(isReviewCommentableDocument(Uri.file(filePath))).toBe(true);
    });

    it("rejects unrelated file scheme documents", () => {
        expect(isReviewCommentableDocument(Uri.file("/a.ts"))).toBe(false);
    });
});

describe("reviewCommentingRanges", () => {
    it("returns one range per line", () => {
        const ranges = reviewCommentingRanges(3);
        expect(ranges).toHaveLength(3);
        expect(ranges[0].start.line).toBe(0);
        expect(ranges[2].start.line).toBe(2);
    });

    it("returns an empty array for empty documents", () => {
        expect(reviewCommentingRanges(0)).toEqual([]);
    });
});
