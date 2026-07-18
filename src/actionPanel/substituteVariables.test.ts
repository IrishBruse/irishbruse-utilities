import { describe, expect, it } from "vitest";
import { substituteVariables } from "./substituteVariables";

describe("substituteVariables", () => {
    it("replaces repo, branch, and base branch placeholders", () => {
        expect(
            substituteVariables("Branch ${branch} in ${repoRoot} vs ${baseBranch}", {
                repoRoot: "/repo",
                branch: "feature/x",
                baseBranch: "main",
            })
        ).toBe("Branch feature/x in /repo vs main");
    });

    it("uses empty strings for missing optional values", () => {
        expect(substituteVariables("${branch}-${baseBranch}", { repoRoot: "/repo" })).toBe("-");
    });
});
