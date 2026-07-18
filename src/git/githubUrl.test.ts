import { beforeEach, describe, expect, it, vi } from "vitest";
import { githubRepoWebUrl, getOriginUrl, parseGithubOwnerRepo } from "./githubUrl";

vi.mock("../utils/asyncSpawn", () => ({
    asyncSpawn: vi.fn(),
}));

import { asyncSpawn } from "../utils/asyncSpawn";

const mockAsyncSpawn = vi.mocked(asyncSpawn);

describe("parseGithubOwnerRepo", () => {
    it("parses HTTPS origin URLs", () => {
        expect(parseGithubOwnerRepo("https://github.com/owner/repo.git")).toEqual({
            owner: "owner",
            repo: "repo",
        });
    });

    it("parses SSH origin URLs", () => {
        expect(parseGithubOwnerRepo("git@github.com:owner/repo.git")).toEqual({
            owner: "owner",
            repo: "repo",
        });
    });

    it("returns undefined for non-GitHub remotes", () => {
        expect(parseGithubOwnerRepo("https://gitlab.com/owner/repo.git")).toBeUndefined();
    });
});

describe("githubRepoWebUrl", () => {
    it("converts HTTPS origin to a browser URL", () => {
        expect(githubRepoWebUrl("https://github.com/o/r.git")).toBe("https://github.com/o/r");
    });

    it("converts SSH origin to a browser URL", () => {
        expect(githubRepoWebUrl("git@github.com:o/r.git")).toBe("https://github.com/o/r");
    });

    it("returns undefined for non-GitHub remotes", () => {
        expect(githubRepoWebUrl("https://gitlab.com/o/r.git")).toBeUndefined();
    });
});

describe("getOriginUrl", () => {
    beforeEach(() => {
        mockAsyncSpawn.mockReset();
    });

    it("returns trimmed origin URL on success", async () => {
        mockAsyncSpawn.mockResolvedValue({
            stdout: "git@github.com:owner/repo.git\n",
            stderr: "",
            status: 0,
        });

        await expect(getOriginUrl("/repo")).resolves.toBe("git@github.com:owner/repo.git");
        expect(mockAsyncSpawn).toHaveBeenCalledWith("git", ["remote", "get-url", "origin"], { cwd: "/repo" });
    });

    it("returns undefined when git remote fails", async () => {
        mockAsyncSpawn.mockResolvedValue({
            stdout: "",
            stderr: "fatal: No such remote",
            status: 2,
        });

        await expect(getOriginUrl("/repo")).resolves.toBeUndefined();
    });
});
