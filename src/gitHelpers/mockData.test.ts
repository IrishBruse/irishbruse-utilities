import { describe, expect, it } from "vitest";
import { getGitHelpersMockState, MOCK_REPO_ROOT } from "./mockData";

describe("getGitHelpersMockState", () => {
    it("returns a stable mock repository root", () => {
        expect(getGitHelpersMockState().repoRoot).toBe(MOCK_REPO_ROOT);
    });

    it("includes a draft PR, checks, review, and change stats", () => {
        const state = getGitHelpersMockState();

        expect(state.pr.isDraft).toBe(true);
        expect(state).not.toHaveProperty("jiraKey");
        expect(state).not.toHaveProperty("jiraBaseUrl");
        expect(state.checkStatus.label).toBe("ci / build");
        expect(state.checkStatus.description).toBe("Checks failing");
        expect(state.checkStatus.isFailing).toBe(true);
        expect(state.reviewStatus.label).toBe("2 unresolved");
        expect(state.changesSummary.changedFiles).toBe(5);
        expect(state.changesSummary.additions).toBe(257);
        expect(state.changesSummary.deletions).toBe(14);
    });
});
