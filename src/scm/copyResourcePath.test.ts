import { describe, expect, it, vi } from "vitest";
import { Uri, workspace } from "vscode";
import { getGitApi } from "../git/getGitApi";
import {
    normalizeScmResources,
    pathsFromScmResources,
    relativePathForScmResource,
    relativePathsForScmResources,
    resolveFileUri,
} from "./copyResourcePath";

vi.mock("../git/getGitApi", () => ({
    getGitApi: vi.fn(),
}));

describe("resolveFileUri", () => {
    it("reads the file path from a git URI", () => {
        const gitUri = Uri.from({
            scheme: "git",
            path: "/repo/src/a.ts",
            query: JSON.stringify({ path: "/repo/src/a.ts", ref: "HEAD" }),
        });
        expect(resolveFileUri(gitUri).fsPath).toBe("/repo/src/a.ts");
    });
});

describe("normalizeScmResources", () => {
    it("reads sourceUri from workbench SCM resources", () => {
        const resources = normalizeScmResources({
            sourceUri: Uri.file("/repo/src/a.ts"),
            resourceGroup: { provider: { rootUri: Uri.file("/repo") } },
        });
        expect(resources).toHaveLength(1);
        expect(resources[0]?.uri.fsPath).toBe("/repo/src/a.ts");
        expect(resources[0]?.repoRoot).toBe("/repo");
    });

    it("reads resourceUri from extension API resource states", () => {
        const resources = normalizeScmResources({ resourceUri: Uri.file("/repo/src/a.ts") });
        expect(resources).toHaveLength(1);
        expect(resources[0]?.uri.fsPath).toBe("/repo/src/a.ts");
        expect(resources[0]?.repoRoot).toBeUndefined();
    });
});

describe("pathsFromScmResources", () => {
    it("returns absolute paths for each resource", () => {
        expect(
            pathsFromScmResources([
                { uri: Uri.file("/repo/src/a.ts") },
                { uri: Uri.file("/repo/src/b.ts") },
            ])
        ).toEqual(["/repo/src/a.ts", "/repo/src/b.ts"]);
    });
});

describe("relativePathForScmResource", () => {
    it("returns workspace-relative paths with forward slashes", () => {
        const uri = Uri.file("/repo/src/foo.ts");
        vi.mocked(getGitApi).mockReturnValue(undefined);
        vi.spyOn(workspace, "asRelativePath").mockReturnValue("src\\foo.ts");

        expect(relativePathForScmResource({ uri })).toBe("src/foo.ts");
    });

    it("falls back to a path relative to the git repository root", () => {
        const uri = Uri.file("/repo/src/foo.ts");
        vi.spyOn(workspace, "asRelativePath").mockReturnValue("/repo/src/foo.ts");
        vi.mocked(getGitApi).mockReturnValue({
            getRepository: () => ({ rootUri: Uri.file("/repo") }),
        } as never);

        expect(relativePathForScmResource({ uri })).toBe("src/foo.ts");
    });
});

describe("relativePathsForScmResources", () => {
    it("resolves the repository root asynchronously when needed", async () => {
        vi.spyOn(workspace, "asRelativePath").mockReturnValue("/repo/src/a.ts");
        vi.mocked(getGitApi).mockReturnValue(undefined);

        const paths = await relativePathsForScmResources([{ uri: Uri.file("/repo/src/a.ts"), repoRoot: "/repo" }]);
        expect(paths).toEqual(["src/a.ts"]);
    });
});
