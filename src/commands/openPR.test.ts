import { beforeEach, describe, expect, it, vi } from "vitest";

const { openExternal, showWarningMessage } = vi.hoisted(() => ({
    openExternal: vi.fn(),
    showWarningMessage: vi.fn(),
}));

vi.mock("vscode", () => ({
    env: { openExternal },
    Uri: { parse: (value: string) => ({ toString: () => value }) },
    window: { showWarningMessage },
}));

vi.mock("../utils/asyncSpawn", () => ({
    asyncSpawn: vi.fn(),
}));

vi.mock("../git/resolveRepositoryPath", () => ({
    resolveRepositoryPath: vi.fn(),
}));

import { asyncSpawn } from "../utils/asyncSpawn";
import { openPR } from "./openPR";

const mockAsyncSpawn = vi.mocked(asyncSpawn);

describe("openPR", () => {
    beforeEach(() => {
        openExternal.mockReset();
        showWarningMessage.mockReset();
        mockAsyncSpawn.mockReset();
    });

    it("opens the PR URL when gh finds a pull request", async () => {
        mockAsyncSpawn.mockImplementation(async (command, args) => {
            if (command === "git" && args?.[0] === "remote") {
                return { stdout: "https://github.com/o/r.git\n", stderr: "", status: 0 };
            }
            if (command === "gh" && args?.includes("pr")) {
                return {
                    stdout: JSON.stringify({
                        number: 42,
                        title: "Fix widget",
                        url: "https://github.com/o/r/pull/42",
                        headRefOid: "abc123",
                    }),
                    stderr: "",
                    status: 0,
                };
            }
            throw new Error(`unexpected command: ${command}`);
        });

        await openPR(undefined, "/repo");

        expect(openExternal).toHaveBeenCalledWith(
            expect.objectContaining({ toString: expect.any(Function) })
        );
        expect(openExternal.mock.calls[0][0].toString()).toBe("https://github.com/o/r/pull/42");
    });

    it("falls back to the repo URL when gh reports no PR", async () => {
        mockAsyncSpawn.mockImplementation(async (command, args) => {
            if (command === "git" && args?.[0] === "remote") {
                return { stdout: "git@github.com:o/r.git\n", stderr: "", status: 0 };
            }
            if (command === "gh" && args?.includes("pr")) {
                return { stdout: "", stderr: "no pull requests found", status: 1 };
            }
            throw new Error(`unexpected command: ${command}`);
        });

        await openPR(undefined, "/repo");

        expect(openExternal.mock.calls[0][0].toString()).toBe("https://github.com/o/r");
    });

    it("falls back to the repo URL when gh is unavailable", async () => {
        mockAsyncSpawn.mockImplementation(async (command, args) => {
            if (command === "git" && args?.[0] === "remote") {
                return { stdout: "https://github.com/o/r.git\n", stderr: "", status: 0 };
            }
            if (command === "gh" && args?.includes("pr")) {
                throw new Error("spawn gh ENOENT");
            }
            throw new Error(`unexpected command: ${command}`);
        });

        await openPR(undefined, "/repo");

        expect(openExternal.mock.calls[0][0].toString()).toBe("https://github.com/o/r");
    });

    it("warns when origin remote cannot be read", async () => {
        mockAsyncSpawn.mockResolvedValue({
            stdout: "",
            stderr: "fatal: No such remote",
            status: 2,
        });

        await openPR(undefined, "/repo");

        expect(showWarningMessage).toHaveBeenCalledWith("Could not read origin remote.");
        expect(openExternal).not.toHaveBeenCalled();
    });
});
