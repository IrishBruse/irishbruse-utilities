import { beforeEach, describe, expect, it, vi } from "vitest";
import type { API } from "./gitApi";

const mockGetExtension = vi.fn();
const mockActivate = vi.fn();

vi.mock("vscode", () => ({
    extensions: {
        getExtension: (...args: unknown[]) => mockGetExtension(...args),
    },
}));

import { resolveGitApi } from "./getGitApi";

function mockApi(state: API["state"]): API {
    return {
        state,
        onDidChangeState: vi.fn(),
        repositories: [],
        onDidOpenRepository: vi.fn(),
        onDidCloseRepository: vi.fn(),
        getRepository: vi.fn().mockReturnValue(null),
        toGitUri: vi.fn(),
    };
}

describe("resolveGitApi", () => {
    beforeEach(() => {
        mockGetExtension.mockReset();
        mockActivate.mockReset();
    });

    it("returns loading while the git API is uninitialized", async () => {
        const api = mockApi("uninitialized");
        mockGetExtension.mockReturnValue({
            isActive: true,
            enabled: true,
            exports: { enabled: true, getAPI: () => api },
        });

        await expect(resolveGitApi()).resolves.toEqual({ status: "loading" });
    });

    it("returns ready when the git API is initialized", async () => {
        const api = mockApi("initialized");
        mockGetExtension.mockReturnValue({
            isActive: true,
            enabled: true,
            exports: { enabled: true, getAPI: () => api },
        });

        await expect(resolveGitApi()).resolves.toEqual({ status: "ready", api });
    });

    it("returns unavailable when the git extension is missing", async () => {
        mockGetExtension.mockReturnValue(undefined);

        await expect(resolveGitApi()).resolves.toEqual({ status: "unavailable" });
    });
});
