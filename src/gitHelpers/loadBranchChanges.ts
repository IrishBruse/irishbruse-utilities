import { getRepositoryByRoot } from "../lib/git/getGitApi";
import { getActiveRepository } from "../lib/git/resolveActiveRepository";
import { resolveBaseBranch, resolveMergeBaseSha } from "../lib/git/resolveBaseBranch";

export type BranchChangesSummary = {
    additions: number;
    deletions: number;
    changedFiles: number;
};

export async function loadBranchChanges(repoRoot: string): Promise<BranchChangesSummary | undefined> {
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
        return changes.reduce<BranchChangesSummary>(
            (totals, change) => ({
                additions: totals.additions + change.insertions,
                deletions: totals.deletions + change.deletions,
                changedFiles: totals.changedFiles + 1,
            }),
            { additions: 0, deletions: 0, changedFiles: 0 }
        );
    } catch {
        return undefined;
    }
}
