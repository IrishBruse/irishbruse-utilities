import { beforeEach, describe, expect, it, vi } from "vitest";

const { showErrorMessage } = vi.hoisted(() => ({
    showErrorMessage: vi.fn(),
}));

vi.mock("vscode", () => ({
    window: { showErrorMessage },
}));

vi.mock("../utils/asyncSpawn", () => ({
    asyncSpawn: vi.fn(),
}));

vi.mock("./githubUrl", () => ({
    getPrInfo: vi.fn(),
}));

import { asyncSpawn } from "../utils/asyncSpawn";
import { getPrInfo } from "./githubUrl";
import { createBlankDraftPullRequest } from "./createDraftPR";

const mockAsyncSpawn = vi.mocked(asyncSpawn);
const mockGetPrInfo = vi.mocked(getPrInfo);

describe("createBlankDraftPullRequest", () => {
    beforeEach(() => {
        showErrorMessage.mockReset();
        mockAsyncSpawn.mockReset();
        mockGetPrInfo.mockReset();
    });

    it("creates a blank draft PR with branch title and empty body", async () => {
        mockAsyncSpawn.mockResolvedValue({ stdout: "", stderr: "", status: 0 });
        mockGetPrInfo.mockResolvedValue({
            number: 7,
            title: "feature/x",
            headRefOid: "abc",
            url: "https://github.com/o/r/pull/7",
            isDraft: true,
            additions: 0,
            deletions: 0,
            changedFiles: 0,
        });

        const pr = await createBlankDraftPullRequest("/repo", "feature/x", "main");

        expect(mockAsyncSpawn).toHaveBeenNthCalledWith(
            1,
            "git",
            ["push", "-u", "origin", "feature/x"],
            { cwd: "/repo" }
        );
        expect(mockAsyncSpawn).toHaveBeenNthCalledWith(
            2,
            "gh",
            [
                "pr",
                "create",
                "--draft",
                "--base",
                "main",
                "--title",
                "feature/x",
                "--body",
                "",
            ],
            { cwd: "/repo" }
        );
        expect(mockGetPrInfo).toHaveBeenCalledWith("/repo", "feature/x");
        expect(pr).toEqual({
            number: 7,
            title: "feature/x",
            headRefOid: "abc",
            url: "https://github.com/o/r/pull/7",
            isDraft: true,
            additions: 0,
            deletions: 0,
            changedFiles: 0,
        });
        expect(showErrorMessage).not.toHaveBeenCalled();
    });

    it("shows an error and returns undefined when push fails", async () => {
        mockAsyncSpawn.mockResolvedValueOnce({
            stdout: "",
            stderr: "fatal: no upstream configured",
            status: 1,
        });

        const pr = await createBlankDraftPullRequest("/repo", "feature/x", "develop");

        expect(pr).toBeUndefined();
        expect(mockGetPrInfo).not.toHaveBeenCalled();
        expect(mockAsyncSpawn).toHaveBeenCalledTimes(1);
        expect(showErrorMessage).toHaveBeenCalledWith(
            "Failed to push branch: fatal: no upstream configured"
        );
    });

    it("shows an error and returns undefined when gh fails", async () => {
        mockAsyncSpawn
            .mockResolvedValueOnce({ stdout: "", stderr: "", status: 0 })
            .mockResolvedValueOnce({
                stdout: "",
                stderr: "GraphQL: Head ref must exist",
                status: 1,
            });

        const pr = await createBlankDraftPullRequest("/repo", "feature/x", "develop");

        expect(pr).toBeUndefined();
        expect(mockGetPrInfo).not.toHaveBeenCalled();
        expect(showErrorMessage).toHaveBeenCalledWith(
            "Failed to create draft PR: GraphQL: Head ref must exist"
        );
    });
});
