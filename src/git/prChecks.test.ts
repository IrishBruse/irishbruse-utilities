import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("./githubUrl", () => ({
    getOriginUrl: vi.fn(),
    parseGithubOwnerRepo: vi.fn(),
    runGh: vi.fn(),
}));

import { getOriginUrl, parseGithubOwnerRepo, runGh } from "./githubUrl";
import { getFailedPrCheck } from "./prChecks";

const mockGetOriginUrl = vi.mocked(getOriginUrl);
const mockParseGithubOwnerRepo = vi.mocked(parseGithubOwnerRepo);
const mockRunGh = vi.mocked(runGh);

describe("getFailedPrCheck", () => {
    beforeEach(() => {
        mockGetOriginUrl.mockReset();
        mockParseGithubOwnerRepo.mockReset();
        mockRunGh.mockReset();
        mockGetOriginUrl.mockResolvedValue("git@github.com:owner/repo.git");
        mockParseGithubOwnerRepo.mockReturnValue({ owner: "owner", repo: "repo" });
    });

    it("returns the first failed check run with a details URL", async () => {
        mockRunGh.mockImplementation(async (_repoRoot, args) => {
            if (args?.[1]?.includes("check-runs")) {
                return {
                    stdout: JSON.stringify({
                        check_runs: [
                            {
                                name: "lint",
                                conclusion: "success",
                                details_url: "https://github.com/owner/repo/actions/runs/1",
                                html_url: "https://api.github.com/repos/owner/repo/check-runs/1",
                            },
                            {
                                name: "test",
                                conclusion: "failure",
                                details_url: "https://github.com/owner/repo/actions/runs/2/job/9",
                                html_url: "https://api.github.com/repos/owner/repo/check-runs/2",
                            },
                        ],
                    }),
                    stderr: "",
                    status: 0,
                };
            }
            throw new Error(`unexpected args: ${args?.join(" ")}`);
        });

        await expect(getFailedPrCheck("/repo", "abc123")).resolves.toEqual({
            name: "test",
            logUrl: "https://github.com/owner/repo/actions/runs/2/job/9",
        });
    });

    it("falls back to combined commit status when no failed check runs exist", async () => {
        mockRunGh.mockImplementation(async (_repoRoot, args) => {
            if (args?.[1]?.includes("check-runs")) {
                return {
                    stdout: JSON.stringify({ check_runs: [] }),
                    stderr: "",
                    status: 0,
                };
            }
            if (args?.[1]?.includes("/status")) {
                return {
                    stdout: JSON.stringify({
                        state: "failure",
                        statuses: [
                            {
                                state: "failure",
                                context: "ci/travis",
                                target_url: "https://travis-ci.org/owner/repo/builds/1",
                            },
                        ],
                    }),
                    stderr: "",
                    status: 0,
                };
            }
            throw new Error(`unexpected args: ${args?.join(" ")}`);
        });

        await expect(getFailedPrCheck("/repo", "abc123")).resolves.toEqual({
            name: "ci/travis",
            logUrl: "https://travis-ci.org/owner/repo/builds/1",
        });
    });

    it("returns undefined when checks are passing", async () => {
        mockRunGh.mockImplementation(async (_repoRoot, args) => {
            if (args?.[1]?.includes("check-runs")) {
                return {
                    stdout: JSON.stringify({
                        check_runs: [
                            {
                                name: "lint",
                                conclusion: "success",
                                details_url: "https://github.com/owner/repo/actions/runs/1",
                                html_url: "https://api.github.com/repos/owner/repo/check-runs/1",
                            },
                        ],
                    }),
                    stderr: "",
                    status: 0,
                };
            }
            if (args?.[1]?.includes("/status")) {
                return {
                    stdout: JSON.stringify({ state: "success", statuses: [] }),
                    stderr: "",
                    status: 0,
                };
            }
            throw new Error(`unexpected args: ${args?.join(" ")}`);
        });

        await expect(getFailedPrCheck("/repo", "abc123")).resolves.toBeUndefined();
    });

    it("returns undefined when origin is not GitHub", async () => {
        mockParseGithubOwnerRepo.mockReturnValue(undefined);

        await expect(getFailedPrCheck("/repo", "abc123")).resolves.toBeUndefined();
        expect(mockRunGh).not.toHaveBeenCalled();
    });
});
