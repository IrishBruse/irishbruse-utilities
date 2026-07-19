import { env, Uri, window } from "vscode";
import { asyncSpawn } from "../utils/asyncSpawn";
import { getRepositoryByRoot } from "./getGitApi";
import { getOriginUrl, parseGithubOwnerRepo } from "./githubUrl";
import { resolveBaseBranch } from "./resolveBaseBranch";
import { formatReviewSummary, loadReviewNotes, markNotesPublished, type ReviewNote } from "./reviewNotes";
import { getReviewCommentController } from "./reviewCommentController";
import { refreshGitPanels } from "./refreshPanels";

type GhPrInfo = {
    number: number;
    headRefOid: string;
    url: string;
};

async function getPrInfo(repoRoot: string): Promise<GhPrInfo | undefined> {
    const result = await asyncSpawn(
        "gh",
        ["pr", "view", "--json", "number,headRefOid,url"],
        { cwd: repoRoot }
    );
    if (result.status !== 0) {
        return undefined;
    }
    try {
        const parsed = JSON.parse(result.stdout) as GhPrInfo;
        return parsed.number ? parsed : undefined;
    } catch {
        return undefined;
    }
}

function normalizeBaseBranchRef(name: string): string {
    return name.replace(/^origin\//, "");
}

async function resolveBaseBranchName(repoRoot: string, branch: string): Promise<string> {
    const data = await loadReviewNotes(repoRoot, branch);
    if (data.baseBranch) {
        return normalizeBaseBranchRef(data.baseBranch);
    }
    const repository = getRepositoryByRoot(repoRoot);
    if (!repository) {
        return "main";
    }
    const base = await resolveBaseBranch(repository);
    return base ? normalizeBaseBranchRef(base.name) : "main";
}

async function createDraftPullRequest(
    repoRoot: string,
    branch: string,
    baseBranch: string,
    pendingCount: number
): Promise<GhPrInfo | undefined> {
    const summary = formatReviewSummary(await loadReviewNotes(repoRoot, branch));
    const title = await window.showInputBox({
        prompt: "Draft pull request title",
        value: branch,
        ignoreFocusOut: true,
    });
    if (!title?.trim()) {
        return undefined;
    }

    const body =
        summary ||
        `Draft PR created from VS Code (${pendingCount} review comment${pendingCount === 1 ? "" : "s"}).`;

    const result = await asyncSpawn(
        "gh",
        [
            "pr",
            "create",
            "--draft",
            "--push",
            "--base",
            baseBranch,
            "--title",
            title.trim(),
            "--body",
            body,
        ],
        { cwd: repoRoot }
    );

    if (result.status !== 0) {
        window.showErrorMessage(`Failed to create draft PR: ${result.stderr || result.stdout}`);
        return undefined;
    }

    return getPrInfo(repoRoot);
}

export async function exportReviewSummary(repoRoot: string, branch: string): Promise<void> {
    const data = await loadReviewNotes(repoRoot, branch);
    const summary = formatReviewSummary(data);
    if (!summary) {
        window.showInformationMessage("No review notes to export.");
        return;
    }
    await env.clipboard.writeText(summary);
    window.showInformationMessage("Review summary copied to clipboard.");
}

export async function publishReviewToPR(repoRoot: string, branch: string): Promise<void> {
    const data = await loadReviewNotes(repoRoot, branch);
    const pending = data.notes.filter((n) => !n.published);
    if (pending.length === 0) {
        window.showInformationMessage("No unpublished review notes.");
        return;
    }

    const baseBranch = await resolveBaseBranchName(repoRoot, branch);
    let pr = await getPrInfo(repoRoot);
    if (!pr) {
        const choice = await window.showInformationMessage(
            `No pull request for ${branch}. Create a draft PR on GitHub and publish ${pending.length} comment(s)?`,
            "Create & Publish",
            "Export",
            "Cancel"
        );
        if (choice === "Export") {
            await exportReviewSummary(repoRoot, branch);
            return;
        }
        if (choice !== "Create & Publish") {
            return;
        }
        pr = await createDraftPullRequest(repoRoot, branch, baseBranch, pending.length);
        if (!pr) {
            return;
        }
    }

    const origin = await getOriginUrl(repoRoot);
    if (!origin) {
        window.showErrorMessage("Could not read origin remote.");
        return;
    }
    const github = parseGithubOwnerRepo(origin);
    if (!github) {
        window.showErrorMessage("Origin is not a recognized GitHub remote.");
        return;
    }

    const publishedIds: string[] = [];
    const failures: string[] = [];

    for (const note of pending) {
        const result = await asyncSpawn(
            "gh",
            ["api", `repos/${github.owner}/${github.repo}/pulls/${pr.number}/comments`, "--input", "-"],
            {
                cwd: repoRoot,
                input: JSON.stringify({
                    body: note.body,
                    commit_id: pr.headRefOid,
                    path: note.file.replace(/\\/g, "/"),
                    line: note.line,
                    side: note.side,
                }),
            }
        );

        if (result.status !== 0) {
            failures.push(`${note.file}:${note.line}`);
            continue;
        }

        publishedIds.push(note.id);
    }

    if (publishedIds.length === 0) {
        window.showErrorMessage(`Failed to publish review comments: ${failures.join(", ")}`);
        return;
    }

    await markNotesPublished(repoRoot, branch, publishedIds);
    await getReviewCommentController()?.refreshForRepo(repoRoot);
    refreshGitPanels();

    if (failures.length > 0) {
        window.showWarningMessage(
            `Published ${publishedIds.length} comment(s) to PR #${pr.number}. Failed: ${failures.join(", ")}.`
        );
        return;
    }

    window.showInformationMessage(`Published ${publishedIds.length} comment(s) to PR #${pr.number}.`, "Open PR").then((choice) => {
        if (choice === "Open PR") {
            env.openExternal(Uri.parse(pr.url));
        }
    });
}

export async function promptAndAddReviewNote(repoRoot: string): Promise<void> {
    const controller = getReviewCommentController();
    if (!controller) {
        window.showWarningMessage("Review comments are not available.");
        return;
    }
    await controller.startDraftAtCursor(repoRoot);
}
