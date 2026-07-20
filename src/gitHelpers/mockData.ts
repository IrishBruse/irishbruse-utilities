import path from "path";
import { TreeItemCollapsibleState, Uri } from "vscode";
import { Commands } from "../constants";
import { Status, type DiffChange } from "../git/gitApi";
import {
    formatPrFileChangeLabel,
    formatPrLineChangeDescription,
    type GhPrInfo,
} from "../git/githubUrl";
import type { PrCheckStatus } from "../git/prChecks";
import type { PrReviewStatus } from "../git/prReviewStatus";
import { GitHelperTreeItem } from "./GitHelperTreeItem";
import { checksTreeItem } from "./checksTreeItem";
import { createChangesTreeCache, type ChangesTreeCache } from "./changesTree";
import type { BranchChangesSummary } from "./loadBranchChanges";

export const MOCK_REPO_ROOT = "/mock/irishbruse-utilities";

export type GitHelpersMockState = {
    repoRoot: string;
    repoName: string;
    branch: string;
    baseBranch: string;
    pr: GhPrInfo;
    jiraKey: string;
    jiraBaseUrl: string;
    checkStatus: PrCheckStatus;
    reviewStatus: PrReviewStatus;
    changesSummary: BranchChangesSummary;
    changesCache: ChangesTreeCache;
    publishReviewCount: number;
};

const MOCK_MERGE_BASE = "abc123def456";

function mockDiffChange(relativePath: string, insertions: number, deletions: number): DiffChange {
    const absolutePath = path.join(MOCK_REPO_ROOT, relativePath);
    const uri = Uri.file(absolutePath);
    return {
        uri,
        originalUri: uri,
        renameUri: undefined,
        status: Status.MODIFIED,
        insertions,
        deletions,
    };
}

export function getGitHelpersMockState(): GitHelpersMockState {
    const changes = [
        mockDiffChange("src/gitHelpers/GitHelpersView.ts", 84, 12),
        mockDiffChange("src/gitHelpers/mockData.ts", 120, 0),
        mockDiffChange("src/gitHelpers/debugMode.ts", 38, 0),
        mockDiffChange("package.json", 14, 2),
        mockDiffChange("CHANGELOG.md", 1, 0),
    ];
    const changesSummary: BranchChangesSummary = {
        additions: 257,
        deletions: 14,
        changedFiles: changes.length,
    };

    return {
        repoRoot: MOCK_REPO_ROOT,
        repoName: "irishbruse-utilities",
        branch: "feature/git-helpers-debug",
        baseBranch: "main",
        pr: {
            number: 42,
            title: "PROJ-123 Add Git Helpers debug mode",
            headRefOid: "deadbeef",
            url: "https://github.com/IrishBruse/irishbruse-utilities/pull/42",
            isDraft: true,
            additions: changesSummary.additions,
            deletions: changesSummary.deletions,
            changedFiles: changesSummary.changedFiles,
        },
        jiraKey: "PROJ-123",
        jiraBaseUrl: "https://example.atlassian.net",
        checkStatus: {
            label: "ci / build",
            description: "Checks failing",
            url: "https://github.com/IrishBruse/irishbruse-utilities/pull/42/checks",
            isFailing: true,
        },
        reviewStatus: {
            label: "2 unresolved",
            description: "Review comments",
            url: "https://github.com/IrishBruse/irishbruse-utilities/pull/42/files",
        },
        changesSummary,
        changesCache: createChangesTreeCache(MOCK_REPO_ROOT, MOCK_MERGE_BASE, changes),
        publishReviewCount: 2,
    };
}

function prRowDescription(pr: { title: string }, jiraKey: string): string {
    const summary = pr.title.replace(new RegExp(`^${jiraKey}\\s*`), "").trim();
    return summary || pr.title;
}

export function buildMockGitHelpersChildren(state: GitHelpersMockState): GitHelperTreeItem[] {
    const { repoRoot, pr, jiraKey, baseBranch, reviewStatus, changesSummary, publishReviewCount } = state;
    const jiraUrl = `${state.jiraBaseUrl}/browse/${jiraKey}`;
    const items: GitHelperTreeItem[] = [];

    const prItem = new GitHelperTreeItem(
        "action",
        repoRoot,
        `PR #${pr.number}`,
        TreeItemCollapsibleState.None,
        `${repoRoot}:openPr:${pr.number}`,
        "openPr",
        prRowDescription(pr, jiraKey)
    );
    prItem.isDraftPr = pr.isDraft;
    prItem.contextValue = "action-openPr-draft-hasJira";
    prItem.prUrl = pr.url;
    prItem.jiraUrl = jiraUrl;
    prItem.jiraKey = jiraKey;
    prItem.command = { command: Commands.OpenPR, title: "Open PR", arguments: [prItem] };
    items.push(prItem);

    items.push(
        new GitHelperTreeItem(
            "action",
            repoRoot,
            "Diff",
            TreeItemCollapsibleState.None,
            `${repoRoot}:diffWithBase`,
            "diffWithBase",
            baseBranch,
            { command: Commands.DiffWithBase, title: "Diff", arguments: [repoRoot] }
        )
    );

    items.push(
        new GitHelperTreeItem(
            "action",
            repoRoot,
            formatPrFileChangeLabel(changesSummary.changedFiles),
            TreeItemCollapsibleState.None,
            `${repoRoot}:showChanges`,
            "showChanges",
            formatPrLineChangeDescription(changesSummary.additions, changesSummary.deletions),
            { command: Commands.ShowBranchChanges, title: "Show changes", arguments: [repoRoot] }
        )
    );

    items.push(checksTreeItem(repoRoot, pr.number, state.checkStatus));

    const reviewItem = new GitHelperTreeItem(
        "action",
        repoRoot,
        reviewStatus.label,
        TreeItemCollapsibleState.None,
        `${repoRoot}:openPrReview:${pr.number}`,
        "openPrReview",
        reviewStatus.description,
        {
            command: Commands.OpenPrReview,
            title: "Open PR review",
            arguments: [repoRoot],
        }
    );
    reviewItem.reviewUrl = reviewStatus.url;
    items.push(reviewItem);

    if (publishReviewCount > 0) {
        items.push(
            new GitHelperTreeItem(
                "action",
                repoRoot,
                "Publish to PR",
                TreeItemCollapsibleState.None,
                `${repoRoot}:publishReview`,
                "publishReview",
                undefined,
                { command: Commands.PublishReviewToPR, title: "Publish to PR", arguments: [repoRoot] }
            )
        );
    }

    return items;
}
