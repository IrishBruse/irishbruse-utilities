import { describe, expect, it, vi } from "vitest";
import type { API, Repository } from "./gitApi";
import { resolveActiveRepository } from "./resolveActiveRepository";

vi.mock("vscode", () => ({
    window: {
        activeTextEditor: undefined,
    },
}));

function mockRepo(root: string, selected: boolean): Repository {
    return {
        rootUri: { fsPath: root } as Repository["rootUri"],
        state: { HEAD: undefined, onDidChange: vi.fn() },
        ui: { selected, onDidChange: vi.fn() },
        getBranch: vi.fn(),
        getBranchBase: vi.fn(),
        getMergeBase: vi.fn(),
        diffBetweenWithStats: vi.fn(),
    };
}

function mockApi(repos: Repository[]): API {
    return {
        state: "initialized",
        onDidChangeState: vi.fn(),
        repositories: repos,
        onDidOpenRepository: vi.fn(),
        onDidCloseRepository: vi.fn(),
        getRepository: vi.fn().mockReturnValue(null),
        toGitUri: vi.fn(),
    };
}

describe("resolveActiveRepository", () => {
    it("prefers the repository selected in Source Control", () => {
        const api = mockApi([mockRepo("/a", false), mockRepo("/b", true)]);
        expect(resolveActiveRepository(api)?.rootUri.fsPath).toBe("/b");
    });

    it("uses the sole repository when none is selected", () => {
        const api = mockApi([mockRepo("/only", false)]);
        expect(resolveActiveRepository(api)?.rootUri.fsPath).toBe("/only");
    });

    it("returns undefined when multiple repos and none selected", async () => {
        const { window } = await import("vscode");
        Object.defineProperty(window, "activeTextEditor", { value: undefined, configurable: true });
        const api = mockApi([mockRepo("/a", false), mockRepo("/b", false)]);
        expect(resolveActiveRepository(api)).toBeUndefined();
    });
});
