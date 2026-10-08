import { describe, expect, it, vi } from "vitest";
import type { API, Repository } from "./gitApi";
import { wireGitRepositories } from "./wireGitRepositories";

vi.mock("./getGitApi", () => ({
    getGitApi: vi.fn(),
    getGitApiAsync: vi.fn(),
}));

import { getGitApi } from "./getGitApi";

function mockRepo(): Repository {
    return {
        rootUri: { fsPath: "/repo" } as Repository["rootUri"],
        state: { HEAD: undefined, onDidChange: vi.fn().mockReturnValue({ dispose: vi.fn() }) },
        ui: { selected: false, onDidChange: vi.fn().mockReturnValue({ dispose: vi.fn() }) },
        getBranch: vi.fn(),
        getBranchBase: vi.fn(),
        getMergeBase: vi.fn(),
        diffBetweenWithStats: vi.fn(),
    };
}

function mockContext() {
    return { subscriptions: [] as { dispose: () => void }[] };
}

describe("wireGitRepositories", () => {
    it("tracks repositories when the git api finishes initializing", () => {
        const onChange = vi.fn();
        const repo = mockRepo();
        let onStateChange: (() => void) | undefined;
        const api: API = {
            state: "uninitialized",
            repositories: [],
            onDidChangeState: vi.fn((handler: () => void) => {
                onStateChange = handler;
                return { dispose: vi.fn() };
            }),
            onDidOpenRepository: vi.fn().mockReturnValue({ dispose: vi.fn() }),
            onDidCloseRepository: vi.fn().mockReturnValue({ dispose: vi.fn() }),
            getRepository: vi.fn().mockReturnValue(null),
            toGitUri: vi.fn(),
        };

        vi.mocked(getGitApi).mockReturnValue(api);
        wireGitRepositories(mockContext() as never, { onChange });

        expect(repo.state.onDidChange).not.toHaveBeenCalled();
        expect(onChange).toHaveBeenCalledTimes(1);

        api.repositories.push(repo);
        onStateChange?.();

        expect(repo.state.onDidChange).toHaveBeenCalledTimes(1);
        expect(repo.ui.onDidChange).toHaveBeenCalledTimes(1);
        expect(onChange).toHaveBeenCalledTimes(2);
    });
});
