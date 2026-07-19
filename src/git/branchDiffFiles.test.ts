import { beforeEach, describe, expect, it } from "vitest";
import { Uri } from "vscode";
import {
    clearBranchDiffSession,
    isBranchDiffWorkingTreeFile,
    setBranchDiffSession,
    workingTreeUriForBranchDiffFile,
} from "./branchDiffFiles";

describe("branchDiffFiles", () => {
    beforeEach(() => {
        clearBranchDiffSession();
    });

    it("tracks working tree files opened in branch diff", () => {
        const filePath = "/repo/src/a.ts";
        setBranchDiffSession("/repo", "abc123", [filePath]);
        expect(isBranchDiffWorkingTreeFile(Uri.file(filePath))).toBe(true);
    });

    it("ignores files outside the tracked branch diff set", () => {
        setBranchDiffSession("/repo", "abc123", ["/repo/src/a.ts"]);
        expect(isBranchDiffWorkingTreeFile(Uri.file("/repo/src/other.ts"))).toBe(false);
    });

    it("ignores git scheme URIs", () => {
        setBranchDiffSession("/repo", "abc123", ["/repo/src/a.ts"]);
        expect(
            isBranchDiffWorkingTreeFile(
                Uri.from({ scheme: "git", path: "/repo/src/a.ts", query: "{}" })
            )
        ).toBe(false);
    });

    it("returns working tree URI for tracked branch diff files", () => {
        setBranchDiffSession("/repo", "abc123", ["/repo/src/a.ts"]);
        expect(workingTreeUriForBranchDiffFile("/repo", "src/a.ts")?.fsPath).toBe("/repo/src/a.ts");
    });
});
