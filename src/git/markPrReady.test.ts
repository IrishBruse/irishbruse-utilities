import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../utils/asyncSpawn", () => ({
    asyncSpawn: vi.fn(),
}));

vi.mock("vscode", () => ({
    window: {
        showErrorMessage: vi.fn(),
    },
}));

import { window } from "vscode";
import { asyncSpawn } from "../utils/asyncSpawn";
import { markPullRequestReady } from "./markPrReady";

const mockAsyncSpawn = vi.mocked(asyncSpawn);
const mockShowErrorMessage = vi.mocked(window.showErrorMessage);

describe("markPullRequestReady", () => {
    beforeEach(() => {
        mockAsyncSpawn.mockReset();
        mockShowErrorMessage.mockReset();
    });

    it("marks the branch PR ready and returns refreshed PR info", async () => {
        mockAsyncSpawn.mockImplementation(async (_command, args) => {
            if (args?.[0] === "pr" && args?.[1] === "ready") {
                return { stdout: "", stderr: "", status: 0 };
            }
            if (args?.[0] === "pr" && args?.[1] === "view") {
                return {
                    stdout: JSON.stringify({
                        number: 12,
                        title: "Feature",
                        headRefOid: "abc",
                        url: "https://github.com/o/r/pull/12",
                        state: "OPEN",
                        isDraft: false,
                    }),
                    stderr: "",
                    status: 0,
                };
            }
            throw new Error(`unexpected args: ${args?.join(" ")}`);
        });

        await expect(markPullRequestReady("/repo", "feature")).resolves.toEqual({
            number: 12,
            title: "Feature",
            headRefOid: "abc",
            url: "https://github.com/o/r/pull/12",
            isDraft: false,
            additions: 0,
            deletions: 0,
            changedFiles: 0,
        });
        expect(mockAsyncSpawn).toHaveBeenCalledWith("gh", ["pr", "ready", "feature"], { cwd: "/repo" });
    });

    it("shows an error and returns undefined when gh fails", async () => {
        mockAsyncSpawn.mockResolvedValue({
            stdout: "",
            stderr: "GraphQL: Pull request is not draft",
            status: 1,
        });

        await expect(markPullRequestReady("/repo", "feature")).resolves.toBeUndefined();
        expect(mockShowErrorMessage).toHaveBeenCalledWith(
            "Failed to mark PR as ready: GraphQL: Pull request is not draft"
        );
    });
});
