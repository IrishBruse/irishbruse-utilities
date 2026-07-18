import path from "path";
import { commands, ExtensionContext, window } from "vscode";
import { asyncSpawn } from "../utils/asyncSpawn";
import { getRepositoryByRoot } from "./getGitApi";
import { resolveBaseBranch, resolveMergeBaseSha } from "./resolveBaseBranch";

const REVIEW_CONTEXT = "ib-utilities.inBranchReview";
const SESSION_KEY = "ib-utilities.branchReviewSession";

export type BranchReviewSession = {
    repoRoot: string;
    branchName: string;
    originalHeadSha: string;
    mergeBaseSha: string;
    baseBranchName: string;
    startedAt: string;
};

let activeSession: BranchReviewSession | undefined;

export function getActiveReviewSession(repoRoot?: string): BranchReviewSession | undefined {
    if (!activeSession) {
        return undefined;
    }
    if (repoRoot && path.normalize(activeSession.repoRoot) !== path.normalize(repoRoot)) {
        return undefined;
    }
    return activeSession;
}

export function isReviewActive(repoRoot?: string): boolean {
    return getActiveReviewSession(repoRoot) !== undefined;
}

async function setReviewContext(active: boolean): Promise<void> {
    await commands.executeCommand("setContext", REVIEW_CONTEXT, active);
}

export async function restoreReviewSession(context: ExtensionContext): Promise<void> {
    const saved = context.workspaceState.get<BranchReviewSession>(SESSION_KEY);
    if (saved) {
        activeSession = saved;
        await setReviewContext(true);
    }
}

async function persistSession(context: ExtensionContext, session: BranchReviewSession | undefined): Promise<void> {
    activeSession = session;
    await context.workspaceState.update(SESSION_KEY, session);
    await setReviewContext(!!session);
}

export async function startBranchReview(context: ExtensionContext, repoRoot: string): Promise<void> {
    const repository = getRepositoryByRoot(repoRoot);
    if (!repository) {
        window.showWarningMessage("Git repository not found.");
        return;
    }

    const head = repository.state.HEAD;
    if (!head?.name || !head.commit) {
        window.showWarningMessage("Repository has no current branch.");
        return;
    }

    const base = await resolveBaseBranch(repository);
    if (!base) {
        window.showWarningMessage("Could not determine a base branch.");
        return;
    }

    const mergeBase = await resolveMergeBaseSha(repository, base);
    if (!mergeBase) {
        window.showWarningMessage("Could not determine merge base.");
        return;
    }

    const confirm = await window.showWarningMessage(
        `Start branch review? This runs git reset --soft to ${base.name} (${mergeBase.slice(0, 7)}). ` +
            "Your branch commits collapse into staged changes for review.",
        { modal: true },
        "Start review"
    );
    if (confirm !== "Start review") {
        return;
    }

    const originalHead = await asyncSpawn("git", ["rev-parse", "HEAD"], { cwd: repoRoot });
    if (originalHead.status !== 0) {
        window.showErrorMessage("Failed to read current HEAD.");
        return;
    }

    const reset = await asyncSpawn("git", ["reset", "--soft", mergeBase], { cwd: repoRoot });
    if (reset.status !== 0) {
        window.showErrorMessage(`git reset --soft failed: ${reset.stderr || reset.stdout}`);
        return;
    }

    await asyncSpawn("git", ["status"], { cwd: repoRoot });

    const session: BranchReviewSession = {
        repoRoot,
        branchName: head.name,
        originalHeadSha: originalHead.stdout.trim(),
        mergeBaseSha: mergeBase,
        baseBranchName: base.name,
        startedAt: new Date().toISOString(),
    };
    await persistSession(context, session);

    await commands.executeCommand("git.viewStagedChanges", repository);
    window.showInformationMessage(`Branch review started against ${base.name}. Staged changes are ready to curate.`);
}

export async function abortBranchReview(context: ExtensionContext, repoRoot: string): Promise<void> {
    const session = getActiveReviewSession(repoRoot);
    if (!session) {
        window.showWarningMessage("No branch review in progress for this repository.");
        return;
    }

    const confirm = await window.showWarningMessage(
        `Abort branch review and restore HEAD to ${session.originalHeadSha.slice(0, 7)}?`,
        { modal: true },
        "Abort review"
    );
    if (confirm !== "Abort review") {
        return;
    }

    const reset = await asyncSpawn("git", ["reset", "--soft", session.originalHeadSha], { cwd: repoRoot });
    if (reset.status !== 0) {
        window.showErrorMessage(`Failed to abort review: ${reset.stderr || reset.stdout}`);
        return;
    }

    await persistSession(context, undefined);
    window.showInformationMessage("Branch review aborted. Original HEAD restored.");
}

export async function openStagedReview(repoRoot: string): Promise<void> {
    const repository = getRepositoryByRoot(repoRoot);
    if (!repository) {
        window.showWarningMessage("Git repository not found.");
        return;
    }
    await commands.executeCommand("git.viewStagedChanges", repository);
}
