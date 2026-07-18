import path from "path";
import { env, Uri, window } from "vscode";
import { asyncSpawn } from "../utils/asyncSpawn";
import { getRepositoryByRoot } from "./getGitApi";
import { formatReviewSummary, loadReviewNotes, markNotesPublished, type ReviewNote } from "./reviewNotes";
import { getActiveReviewSession } from "./reviewSession";

type GhPrInfo = {
    number: number;
    headRefOid: string;
    url: string;
};

function parseGithubOwnerRepo(remoteUrl: string): { owner: string; repo: string } | undefined {
    const trimmed = remoteUrl.trim().replace(/\.git$/, "");
    const sshMatch = trimmed.match(/git@[^:]+:([^/]+)\/(.+)$/);
    if (sshMatch) {
        return { owner: sshMatch[1], repo: sshMatch[2] };
    }
    const httpsMatch = trimmed.match(/github\.com[:/]([^/]+)\/([^/]+)$/);
    if (httpsMatch) {
        return { owner: httpsMatch[1], repo: httpsMatch[2] };
    }
    return undefined;
}

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

async function getOriginUrl(repoRoot: string): Promise<string | undefined> {
    const result = await asyncSpawn("git", ["remote", "get-url", "origin"], { cwd: repoRoot });
    if (result.status !== 0) {
        return undefined;
    }
    return result.stdout.trim();
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

    const pr = await getPrInfo(repoRoot);
    if (!pr) {
        const exportInstead = await window.showInformationMessage(
            "No pull request found for this branch. Export summary to clipboard instead?",
            "Export",
            "Cancel"
        );
        if (exportInstead === "Export") {
            await exportReviewSummary(repoRoot, branch);
        }
        return;
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

    const payload = {
        commit_id: pr.headRefOid,
        event: "COMMENT",
        body: `Review notes from VS Code (${pending.length} comment${pending.length === 1 ? "" : "s"})`,
        comments: pending.map((note: ReviewNote) => ({
            path: note.file.replace(/\\/g, "/"),
            line: note.line,
            side: note.side,
            body: note.body,
        })),
    };

    const result = await asyncSpawn(
        "gh",
        ["api", `repos/${github.owner}/${github.repo}/pulls/${pr.number}/reviews`, "--input", "-"],
        { cwd: repoRoot, input: JSON.stringify(payload) }
    );

    if (result.status !== 0) {
        window.showErrorMessage(`Failed to publish review: ${result.stderr || result.stdout}`);
        return;
    }

    await markNotesPublished(repoRoot, branch, pending.map((n) => n.id));
    window.showInformationMessage(`Published ${pending.length} comment(s) to PR #${pr.number}.`, "Open PR").then((choice) => {
        if (choice === "Open PR") {
            env.openExternal(Uri.parse(pr.url));
        }
    });
}

export async function promptAndAddReviewNote(repoRoot: string): Promise<void> {
    const repository = getRepositoryByRoot(repoRoot);
    const editor = window.activeTextEditor;
    if (!editor) {
        window.showWarningMessage("Open a file to add a review note.");
        return;
    }

    const head = repository?.state.HEAD;
    if (!head?.name) {
        window.showWarningMessage("Could not determine current branch.");
        return;
    }

    const session = getActiveReviewSession(repoRoot);
    const baseBranch = session?.baseBranchName ?? "main";

    let filePath = editor.document.uri.fsPath;
    const repoRootNorm = path.normalize(repoRoot);
    if (filePath.startsWith(repoRootNorm)) {
        filePath = path.relative(repoRoot, filePath);
    }
    if (editor.document.uri.scheme === "git") {
        try {
            const params = JSON.parse(editor.document.uri.query) as { path?: string };
            if (params.path) {
                filePath = path.relative(repoRoot, params.path);
            }
        } catch {
            // keep fsPath relative
        }
    }

    const line = editor.selection.active.line + 1;
    const body = await window.showInputBox({
        prompt: "Why was this change made?",
        placeHolder: "Review note (Markdown supported)",
        ignoreFocusOut: true,
    });
    if (!body?.trim()) {
        return;
    }

    const { addReviewNote } = await import("./reviewNotes");
    await addReviewNote(repoRoot, head.name, baseBranch, filePath.replace(/\\/g, "/"), line, "RIGHT", body.trim());
    window.showInformationMessage("Review note saved.");
}
