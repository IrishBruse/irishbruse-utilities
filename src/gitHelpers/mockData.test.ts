import { describe, expect, it } from "vitest";
import { getGitHelpersMockState, MOCK_REPO_ROOT } from "./mockData";

describe("getGitHelpersMockState", () => {
    it("returns a stable mock repository root", () => {
        expect(getGitHelpersMockState().repoRoot).toBe(MOCK_REPO_ROOT);
    });

    it("includes draft PR, Jira, checks, review, and branch changes fixtures", () => {
        const state = getGitHelpersMockState();

        expect(state.pr.isDraft).toBe(true);
        expect(state.jiraKey).toBe("PROJ-123");
        expect(state.checkStatus.label).toBe("ci / build");
        expect(state.checkStatus.description).toBe("Checks failing");
        expect(state.checkStatus.isFailing).toBe(true);
        expect(state.reviewStatus.label).toBe("2 unresolved");
        expect(state.changesCache.paths).toHaveLength(state.changesSummary.changedFiles);
    });
});
