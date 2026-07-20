import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
    openExternal: vi.fn(),
    showWarningMessage: vi.fn(),
    getActiveRepository: vi.fn(),
    getRepositoryByRoot: vi.fn(),
    getPrInfo: vi.fn(),
}));

vi.mock("vscode", () => ({
    env: { openExternal: mocks.openExternal },
    window: { showWarningMessage: mocks.showWarningMessage },
    Uri: { parse: (value: string) => ({ toString: () => value }) },
}));

vi.mock("../git/resolveActiveRepository", () => ({
    getActiveRepository: mocks.getActiveRepository,
}));

vi.mock("../git/getGitApi", () => ({
    getRepositoryByRoot: mocks.getRepositoryByRoot,
}));

vi.mock("../git/githubUrl", () => ({
    getPrInfo: mocks.getPrInfo,
    getPrChangesUrl: (url: string) => `${url}/changes`,
}));

import { openPrChanges } from "./openPrChanges";

describe("openPrChanges", () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it("opens a cached changes URL when provided", async () => {
        await openPrChanges("/repo", "https://github.com/o/r/pull/7/changes");

        expect(mocks.openExternal).toHaveBeenCalledWith(
            expect.objectContaining({ toString: expect.any(Function) })
        );
        expect(mocks.getPrInfo).not.toHaveBeenCalled();
    });

    it("resolves the PR changes URL from the current branch", async () => {
        mocks.getActiveRepository.mockResolvedValue({
            rootUri: { fsPath: "/repo" },
            state: { HEAD: { name: "feature" } },
        });
        mocks.getRepositoryByRoot.mockReturnValue({
            state: { HEAD: { name: "feature" } },
        });
        mocks.getPrInfo.mockResolvedValue({
            url: "https://github.com/o/r/pull/7",
        });

        await openPrChanges("/repo");

        expect(mocks.openExternal).toHaveBeenCalled();
        const uri = mocks.openExternal.mock.calls[0][0];
        expect(uri.toString()).toBe("https://github.com/o/r/pull/7/changes");
    });
});
