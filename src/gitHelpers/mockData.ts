import { TreeItemCollapsibleState } from "vscode";
import { Commands } from "../constants";
import {
    formatPrFileChangeLabel,
    formatPrLineChangeDescription,
    type GhPrInfo,
} from "../lib/git/githubUrl";
import type { PrCheckStatus } from "../lib/git/prChecks";
import type { PrReviewStatus } from "../lib/git/prReviewStatus";
import { GitHelperTreeItem } from "./GitHelperTreeItem";
import { checksTreeItem } from "./checksTreeItem";
import type { BranchChangesSummary } from "./loadBranchChanges";

export const MOCK_REPO_ROOT = "/mock/irishbruse-utilities";

export type GitHelpersMockState = {
    repoRoot: string;
    repoName: string;
    branch: string;
    baseBranch: string;
    pr: GhPrInfo;
    checkStatus: PrCheckStatus;
    reviewStatus: PrReviewStatus;
    changesSummary: BranchChangesSummary;
};

export function getGitHelpersMockState(): GitHelpersMockState {
    const changesSummary: BranchChangesSummary = {
        additions: 257,
        deletions: 14,
        changedFiles: 5,
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
    };
}

export function buildMockGitHelpersChildren(state: GitHelpersMockState): GitHelperTreeItem[] {
    const { repoRoot, pr, baseBranch, reviewStatus, changesSummary } = state;
    const items: GitHelperTreeItem[] = [];

    const prItem = new GitHelperTreeItem(
        "action",
        repoRoot,
        `PR #${pr.number}`,
        TreeItemCollapsibleState.None,
        `${repoRoot}:openPr:${pr.number}`,
        "openPr",
        pr.title
    );
    prItem.isDraftPr = pr.isDraft;
    prItem.contextValue = "action-openPr-draft";
    prItem.prUrl = pr.url;
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
            { command: Commands.DiffWithBase, title: "Diff", arguments: [repoRoot] }
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

    return items;
}
