import { beforeEach, describe, expect, it } from "vitest";
import { Uri } from "vscode";
import {
    clearBranchDiffWorkingTreeFiles,
    isBranchDiffWorkingTreeFile,
    setBranchDiffWorkingTreeFiles,
} from "./branchDiffFiles";

describe("branchDiffFiles", () => {
    beforeEach(() => {
        clearBranchDiffWorkingTreeFiles();
    });

    it("tracks working tree files opened in branch diff", () => {
        const filePath = "/repo/src/a.ts";
        setBranchDiffWorkingTreeFiles([filePath]);
        expect(isBranchDiffWorkingTreeFile(Uri.file(filePath))).toBe(true);
    });

    it("ignores files outside the tracked branch diff set", () => {
        setBranchDiffWorkingTreeFiles(["/repo/src/a.ts"]);
        expect(isBranchDiffWorkingTreeFile(Uri.file("/repo/src/other.ts"))).toBe(false);
    });

    it("ignores git scheme URIs", () => {
        setBranchDiffWorkingTreeFiles(["/repo/src/a.ts"]);
        expect(
            isBranchDiffWorkingTreeFile(
                Uri.from({ scheme: "git", path: "/repo/src/a.ts", query: "{}" })
            )
        ).toBe(false);
    });
});
