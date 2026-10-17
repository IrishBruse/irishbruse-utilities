import { describe, expect, it, vi } from "vite-plus/test";

vi.mock("vscode", () => ({
    TreeItemCollapsibleState: { None: 0, Collapsed: 1, Expanded: 2 },
    ThemeIcon: class ThemeIcon {
        constructor(public id: string) {}
    },
    TreeItem: class TreeItem {
        constructor(
            public label: string,
            public collapsibleState: number,
        ) {}
    },
}));

import { buildMockGitHelpersChildren, getGitHelpersMockState, MOCK_REPO_ROOT } from "./mockData";
import { formatDiffTreeDescription } from "./diffDescription";

describe("getGitHelpersMockState", () => {
    it("returns a stable mock repository root", () => {
        expect(getGitHelpersMockState().repoRoot).toBe(MOCK_REPO_ROOT);
    });

    it("includes a draft PR, review, and change stats", () => {
        const state = getGitHelpersMockState();

        expect(state.pr.isDraft).toBe(true);
        expect(state).not.toHaveProperty("jiraKey");
        expect(state).not.toHaveProperty("jiraBaseUrl");
        expect(state.reviewStatus.label).toBe("2 unresolved");
        expect(state.changesSummary.changedFiles).toBe(5);
        expect(state.changesSummary.additions).toBe(257);
        expect(state.changesSummary.deletions).toBe(14);
    });
});

describe("buildMockGitHelpersChildren", () => {
    it("shows one Diff row with merged change stats and no Checks or Changes rows", () => {
        const state = getGitHelpersMockState();
        const items = buildMockGitHelpersChildren(state);
        const actions = items.map((item) => item.action);

        expect(actions).not.toContain("showChanges");
        expect(actions).not.toContain("openPrChecks");

        const diff = items.find((item) => item.action === "diffWithBase");
        expect(diff?.label).toBe("Diff");
        expect(diff?.description).toBe(
            formatDiffTreeDescription(state.baseBranch, state.changesSummary),
        );
        expect(diff?.description).toContain("5 files");
        expect(diff?.description).toContain("+257");
        expect(diff?.description).toContain("−14");
    });
});
