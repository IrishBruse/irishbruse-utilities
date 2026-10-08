import { describe, expect, it } from "vitest";
import { Uri } from "vscode";
import { pathLooksRelative, relativePathFromRepoRoot } from "./gitRepositoryRoot";

describe("relativePathFromRepoRoot", () => {
    it("returns a posix-style path under the repository root", () => {
        expect(relativePathFromRepoRoot(Uri.file("/repo/src/foo.ts"), "/repo")).toBe("src/foo.ts");
    });
});

describe("pathLooksRelative", () => {
    it("rejects absolute paths and paths equal to the full file path", () => {
        expect(pathLooksRelative("src/foo.ts", "/repo/src/foo.ts")).toBe(true);
        expect(pathLooksRelative("/repo/src/foo.ts", "/repo/src/foo.ts")).toBe(false);
        expect(pathLooksRelative("/repo/src/foo.ts", "/repo/src/foo.ts")).toBe(false);
    });
});
