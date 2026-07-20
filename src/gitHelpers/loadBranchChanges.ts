import { getRepositoryByRoot } from "../git/getGitApi";
import { getActiveRepository } from "../git/resolveActiveRepository";
import { resolveBaseBranch, resolveMergeBaseSha } from "../git/resolveBaseBranch";
import { createChangesTreeCache, type ChangesTreeCache } from "./changesTree";

export type BranchChangesSummary = {
    additions: number;
    deletions: number;
    changedFiles: number;
};

export async function loadBranchChanges(
    repoRoot: string
): Promise<{ cache: ChangesTreeCache; summary: BranchChangesSummary } | undefined> {
    let repository = getRepositoryByRoot(repoRoot);
    if (!repository) {
        const active = await getActiveRepository();
        if (active?.rootUri.fsPath === repoRoot) {
            repository = active;
        }
    }
    if (!repository) {
        return undefined;
    }

    const base = await resolveBaseBranch(repository);
    if (!base) {
        return undefined;
    }

    const mergeBase = (await resolveMergeBaseSha(repository, base)) ?? base.ref;
    try {
        const changes = await repository.diffBetweenWithStats(mergeBase, "HEAD");
        const cache = createChangesTreeCache(repoRoot, mergeBase, changes);
        const summary = changes.reduce<BranchChangesSummary>(
            (totals, change) => ({
                additions: totals.additions + change.insertions,
                deletions: totals.deletions + change.deletions,
                changedFiles: totals.changedFiles + 1,
            }),
            { additions: 0, deletions: 0, changedFiles: 0 }
        );
        return { cache, summary };
    } catch {
        return undefined;
    }
}
