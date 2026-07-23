import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("vscode", () => ({
    workspace: {
        getConfiguration: vi.fn(),
    },
}));

vi.mock("../utils/asyncSpawn", () => ({
    asyncSpawn: vi.fn(),
}));

import { workspace } from "vscode";
import { asyncSpawn } from "../utils/asyncSpawn";
import { getGhCommand, runGh, spawnGh } from "./ghCli";

const mockGetConfiguration = vi.mocked(workspace.getConfiguration);
const mockAsyncSpawn = vi.mocked(asyncSpawn);

function mockGhPath(value: unknown): void {
    mockGetConfiguration.mockReturnValue({
        get: vi.fn().mockReturnValue(value),
    } as ReturnType<typeof workspace.getConfiguration>);
}

describe("getGhCommand", () => {
    beforeEach(() => {
        mockGetConfiguration.mockReset();
    });

    it("returns gh when the setting is empty", () => {
        mockGhPath("");

        expect(getGhCommand()).toBe("gh");
    });

    it("returns gh when the setting is unset", () => {
        mockGhPath(undefined);

        expect(getGhCommand()).toBe("gh");
    });

    it("returns the configured absolute path", () => {
        mockGhPath("/opt/homebrew/bin/gh");

        expect(getGhCommand()).toBe("/opt/homebrew/bin/gh");
    });

    it("ignores whitespace-only values", () => {
        mockGhPath("   ");

        expect(getGhCommand()).toBe("gh");
    });
});

describe("spawnGh", () => {
    beforeEach(() => {
        mockGhPath("/opt/homebrew/bin/gh");
        mockAsyncSpawn.mockReset();
        mockAsyncSpawn.mockResolvedValue({ stdout: "", stderr: "", status: 0 });
    });

    it("spawns the configured gh executable", async () => {
        await spawnGh("/repo", ["pr", "view"]);

        expect(mockAsyncSpawn).toHaveBeenCalledWith(
            "/opt/homebrew/bin/gh",
            ["pr", "view"],
            expect.objectContaining({ cwd: "/repo" })
        );
    });
});

describe("runGh", () => {
    beforeEach(() => {
        mockGhPath("");
        mockAsyncSpawn.mockReset();
    });

    it("returns undefined when gh cannot be spawned", async () => {
        mockAsyncSpawn.mockRejectedValue(new Error("spawn gh ENOENT"));

        await expect(runGh("/repo", ["pr", "view"])).resolves.toBeUndefined();
    });
});
