import { beforeEach, describe, expect, it, vi } from "vitest";
import {
    formatPrFileChangeLabel,
    formatPrLineChangeDescription,
    getGithubHeadFileUrls,
    getHeadRef,
    getPrChangesUrl,
    githubHeadFileWebUrl,
    githubRepoWebUrl,
    getOriginUrl,
    getPrInfo,
    parseGithubOwnerRepo,
} from "./githubUrl";

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

describe("githubHeadFileWebUrl", () => {
    it("builds a blob URL for a branch and file path", () => {
        expect(
            githubHeadFileWebUrl("https://github.com/o/r.git", "feature", "src/foo.ts")
        ).toBe("https://github.com/o/r/blob/feature/src/foo.ts");
    });

    it("encodes branch slashes and file path segments", () => {
        expect(
            githubHeadFileWebUrl("git@github.com:o/r.git", "feature/foo", "src/my file.ts")
        ).toBe("https://github.com/o/r/blob/feature%2Ffoo/src/my%20file.ts");
    });

    it("returns undefined for non-GitHub remotes", () => {
        expect(githubHeadFileWebUrl("https://gitlab.com/o/r.git", "main", "a.ts")).toBeUndefined();
    });
});

describe("getHeadRef", () => {
    beforeEach(() => {
        mockAsyncSpawn.mockReset();
    });

    it("returns the current branch name when not detached", async () => {
        mockAsyncSpawn.mockResolvedValue({
            stdout: "feature-branch\n",
            stderr: "",
            status: 0,
        });

        await expect(getHeadRef("/repo")).resolves.toBe("feature-branch");
        expect(mockAsyncSpawn).toHaveBeenCalledWith(
            "git",
            ["rev-parse", "--abbrev-ref", "HEAD"],
            { cwd: "/repo" }
        );
    });

    it("falls back to the commit SHA when HEAD is detached", async () => {
        mockAsyncSpawn.mockImplementation(async (_command, args) => {
            if (args?.[1] === "--abbrev-ref") {
                return { stdout: "HEAD\n", stderr: "", status: 0 };
            }
            if (args?.[1] === "HEAD" && args?.[0] === "rev-parse") {
                return { stdout: "abc123def456\n", stderr: "", status: 0 };
            }
            throw new Error(`unexpected args: ${args?.join(" ")}`);
        });

        await expect(getHeadRef("/repo")).resolves.toBe("abc123def456");
    });
});

describe("getGithubHeadFileUrls", () => {
    beforeEach(() => {
        mockAsyncSpawn.mockReset();
    });

    it("builds blob URLs from origin and HEAD", async () => {
        mockAsyncSpawn.mockImplementation(async (_command, args) => {
            if (args?.[0] === "remote") {
                return { stdout: "git@github.com:o/r.git\n", stderr: "", status: 0 };
            }
            if (args?.[1] === "--abbrev-ref") {
                return { stdout: "main\n", stderr: "", status: 0 };
            }
            throw new Error(`unexpected args: ${args?.join(" ")}`);
        });

        await expect(getGithubHeadFileUrls("/repo", ["src/a.ts", "src/b.ts"])).resolves.toEqual([
            "https://github.com/o/r/blob/main/src/a.ts",
            "https://github.com/o/r/blob/main/src/b.ts",
        ]);
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

describe("formatPrFileChangeLabel", () => {
    it("uses singular copy for one file", () => {
        expect(formatPrFileChangeLabel(1)).toBe("1 file");
    });

    it("uses plural copy for multiple files", () => {
        expect(formatPrFileChangeLabel(12)).toBe("12 files");
    });
});

describe("formatPrLineChangeDescription", () => {
    it("formats additions and deletions", () => {
        expect(formatPrLineChangeDescription(340, 28)).toBe("+340 −28");
    });
});

describe("getPrChangesUrl", () => {
    it("appends /changes to the PR web URL", () => {
        expect(getPrChangesUrl("https://github.com/o/r/pull/7")).toBe("https://github.com/o/r/pull/7/changes");
    });
});

describe("getPrInfo", () => {
    beforeEach(() => {
        mockAsyncSpawn.mockReset();
    });

    it("returns PR details when gh finds a pull request", async () => {
        mockAsyncSpawn.mockResolvedValue({
            stdout: JSON.stringify({
                number: 7,
                title: "Add feature",
                headRefOid: "deadbeef",
                url: "https://github.com/o/r/pull/7",
                additions: 10,
                deletions: 2,
                changedFiles: 3,
            }),
            stderr: "",
            status: 0,
        });

        await expect(getPrInfo("/repo")).resolves.toEqual({
            number: 7,
            title: "Add feature",
            headRefOid: "deadbeef",
            url: "https://github.com/o/r/pull/7",
            isDraft: false,
            additions: 10,
            deletions: 2,
            changedFiles: 3,
        });
        expect(mockAsyncSpawn).toHaveBeenCalledWith(
            "gh",
            ["pr", "view", "--json", "number,title,headRefOid,url,state,isDraft,additions,deletions,changedFiles"],
            expect.objectContaining({ cwd: "/repo" })
        );
    });

    it("falls back to gh pr list when view fails for a branch", async () => {
        mockAsyncSpawn.mockImplementation(async (_command, args) => {
            if (args?.[0] === "pr" && args?.[1] === "view") {
                return { stdout: "", stderr: "not found", status: 1 };
            }
            if (args?.[0] === "pr" && args?.[1] === "list") {
                return {
                    stdout: JSON.stringify([
                        {
                            number: 9,
                            title: "Listed PR",
                            headRefOid: "abc",
                            url: "https://github.com/o/r/pull/9",
                        },
                    ]),
                    stderr: "",
                    status: 0,
                };
            }
            throw new Error(`unexpected args: ${args?.join(" ")}`);
        });

        await expect(getPrInfo("/repo", "feature")).resolves.toEqual({
            number: 9,
            title: "Listed PR",
            headRefOid: "abc",
            url: "https://github.com/o/r/pull/9",
            isDraft: false,
            additions: 0,
            deletions: 0,
            changedFiles: 0,
        });
    });

    it("queries gh with the branch name when provided", async () => {
        mockAsyncSpawn.mockResolvedValue({
            stdout: JSON.stringify({
                number: 3,
                title: "Branch PR",
                headRefOid: "abc",
                url: "https://github.com/o/r/pull/3",
            }),
            stderr: "",
            status: 0,
        });

        await expect(getPrInfo("/repo", "feature")).resolves.toMatchObject({ number: 3 });
        expect(mockAsyncSpawn).toHaveBeenCalledWith(
            "gh",
            ["pr", "view", "feature", "--json", "number,title,headRefOid,url,state,isDraft,additions,deletions,changedFiles"],
            expect.objectContaining({ cwd: "/repo" })
        );
    });

    it("ignores closed PRs from gh pr view and falls back to open PR list", async () => {
        mockAsyncSpawn.mockImplementation(async (_command, args) => {
            if (args?.[0] === "pr" && args?.[1] === "view") {
                return {
                    stdout: JSON.stringify({
                        number: 4,
                        title: "Closed PR",
                        headRefOid: "deadbeef",
                        url: "https://github.com/o/r/pull/4",
                        state: "CLOSED",
                    }),
                    stderr: "",
                    status: 0,
                };
            }
            if (args?.[0] === "pr" && args?.[1] === "list") {
                return {
                    stdout: JSON.stringify([
                        {
                            number: 11,
                            title: "Open PR",
                            headRefOid: "abc",
                            url: "https://github.com/o/r/pull/11",
                            state: "OPEN",
                        },
                    ]),
                    stderr: "",
                    status: 0,
                };
            }
            if (args?.[0] === "remote") {
                return {
                    stdout: "git@github.com:o/r.git\n",
                    stderr: "",
                    status: 0,
                };
            }
            throw new Error(`unexpected args: ${args?.join(" ")}`);
        });

        await expect(getPrInfo("/repo", "feature")).resolves.toEqual({
            number: 11,
            title: "Open PR",
            headRefOid: "abc",
            url: "https://github.com/o/r/pull/11",
            isDraft: false,
            additions: 0,
            deletions: 0,
            changedFiles: 0,
        });
    });

    it("returns undefined when only a closed PR exists for the branch", async () => {
        mockAsyncSpawn.mockImplementation(async (_command, args) => {
            if (args?.[0] === "pr" && args?.[1] === "view") {
                return {
                    stdout: JSON.stringify({
                        number: 4,
                        title: "Closed PR",
                        headRefOid: "deadbeef",
                        url: "https://github.com/o/r/pull/4",
                        state: "MERGED",
                    }),
                    stderr: "",
                    status: 0,
                };
            }
            if (args?.[0] === "pr" && args?.[1] === "list") {
                return { stdout: "[]", stderr: "", status: 0 };
            }
            if (args?.[0] === "remote") {
                return {
                    stdout: "git@github.com:o/r.git\n",
                    stderr: "",
                    status: 0,
                };
            }
            throw new Error(`unexpected args: ${args?.join(" ")}`);
        });

        await expect(getPrInfo("/repo", "feature")).resolves.toBeUndefined();
    });

    it("returns undefined when gh reports no PR", async () => {
        mockAsyncSpawn.mockResolvedValue({
            stdout: "",
            stderr: "no pull requests found",
            status: 1,
        });

        await expect(getPrInfo("/repo")).resolves.toBeUndefined();
    });

    it("returns undefined when gh is unavailable", async () => {
        mockAsyncSpawn.mockRejectedValue(new Error("spawn gh ENOENT"));

        await expect(getPrInfo("/repo")).resolves.toBeUndefined();
    });
});
