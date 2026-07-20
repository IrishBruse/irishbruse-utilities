import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("./githubUrl", () => ({
    getOriginUrl: vi.fn(),
    parseGithubOwnerRepo: vi.fn(),
    runGh: vi.fn(),
}));

import { getOriginUrl, parseGithubOwnerRepo, runGh } from "./githubUrl";
import { buildPrCheckStatus, getFailedPrCheck, getPrCheckStatus } from "./prChecks";

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

describe("buildPrCheckStatus", () => {
    it("reports failing checks with the failed job URL", () => {
        expect(
            buildPrCheckStatus(
                [
                    {
                        name: "test",
                        conclusion: "failure",
                        details_url: "https://github.com/owner/repo/actions/runs/2/job/9",
                        html_url: "https://api.github.com/repos/owner/repo/check-runs/2",
                    },
                ],
                undefined,
                "https://github.com/owner/repo/pull/7"
            )
        ).toEqual({
            label: "test",
            description: "Checks failing",
            url: "https://github.com/owner/repo/actions/runs/2/job/9",
            isFailing: true,
        });
    });

    it("reports all green when every check succeeded", () => {
        expect(
            buildPrCheckStatus(
                [
                    {
                        name: "lint",
                        conclusion: "success",
                        details_url: "https://github.com/owner/repo/actions/runs/1",
                        html_url: "https://api.github.com/repos/owner/repo/check-runs/1",
                    },
                ],
                { state: "success", statuses: [] },
                "https://github.com/owner/repo/pull/7"
            )
        ).toEqual({
            label: "Checks",
            description: "All green",
            url: "https://github.com/owner/repo/pull/7/checks",
            isFailing: false,
        });
    });

    it("returns undefined when there are no check runs or commit statuses", () => {
        expect(
            buildPrCheckStatus([], { state: "pending", statuses: [] }, "https://github.com/owner/repo/pull/7")
        ).toBeUndefined();
        expect(buildPrCheckStatus([], undefined, "https://github.com/owner/repo/pull/7")).toBeUndefined();
    });
});

describe("getPrCheckStatus", () => {
    beforeEach(() => {
        mockGetOriginUrl.mockReset();
        mockParseGithubOwnerRepo.mockReset();
        mockRunGh.mockReset();
        mockGetOriginUrl.mockResolvedValue("git@github.com:owner/repo.git");
        mockParseGithubOwnerRepo.mockReturnValue({ owner: "owner", repo: "repo" });
    });

    it("returns pending when checks are still running", async () => {
        mockRunGh.mockImplementation(async (_repoRoot, args) => {
            if (args?.[1]?.includes("check-runs")) {
                return {
                    stdout: JSON.stringify({
                        check_runs: [
                            {
                                name: "lint",
                                conclusion: "in_progress",
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
                return { stdout: JSON.stringify({ state: "pending", statuses: [] }), stderr: "", status: 0 };
            }
            throw new Error(`unexpected args: ${args?.join(" ")}`);
        });

        await expect(getPrCheckStatus("/repo", "abc123", "https://github.com/owner/repo/pull/7")).resolves.toEqual({
            label: "Checks",
            description: "Pending",
            url: "https://github.com/owner/repo/pull/7/checks",
            isFailing: false,
        });
    });

    it("returns undefined when the PR has no checks configured", async () => {
        mockRunGh.mockImplementation(async (_repoRoot, args) => {
            if (args?.[1]?.includes("check-runs")) {
                return { stdout: JSON.stringify({ check_runs: [] }), stderr: "", status: 0 };
            }
            if (args?.[1]?.includes("/status")) {
                return { stdout: JSON.stringify({ state: "pending", statuses: [] }), stderr: "", status: 0 };
            }
            throw new Error(`unexpected args: ${args?.join(" ")}`);
        });

        await expect(
            getPrCheckStatus("/repo", "abc123", "https://github.com/owner/repo/pull/7")
        ).resolves.toBeUndefined();
    });
});
