import { describe, expect, it } from "vitest";
import { substituteVariables } from "./substituteVariables";

describe("substituteVariables", () => {
    it("replaces repo, branch, and base branch placeholders", () => {
        expect(
            substituteVariables("Branch ${branch} in ${repoRoot} vs ${baseBranch}", {
                repoRoot: "/repo",
                branch: "feature/x",
                baseBranch: "main",
                file: "",
                selection: "",
            })
        ).toBe("Branch feature/x in /repo vs main");
    });

    it("uses empty strings for missing optional values", () => {
        expect(
            substituteVariables("${branch}-${baseBranch}-${file}-${selection}", {
                repoRoot: "/repo",
                file: "",
                selection: "",
            })
        ).toBe("---");
    });

    it("replaces file and selection placeholders", () => {
        expect(
            substituteVariables("Review ${file}\n${selection}", {
                repoRoot: "/repo",
                file: "src/foo.ts",
                selection: "```src/foo.ts:12-34\ncode here\n```",
            })
        ).toBe("Review src/foo.ts\n```src/foo.ts:12-34\ncode here\n```");
    });
});
