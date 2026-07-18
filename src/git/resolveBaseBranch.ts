import type { Branch, Repository } from "./gitApi";

export type ResolvedBaseBranch = {
    /** Display name, e.g. main or origin/main */
    name: string;
    /** Ref for git operations (commit sha or branch name) */
    ref: string;
};

const FALLBACK_CANDIDATES = ["main", "master", "origin/main", "origin/master"] as const;

export function formatBranchName(branch: Branch): string {
    if (branch.remote && branch.name) {
        return `${branch.remote}/${branch.name}`;
    }
    return branch.name ?? branch.commit ?? "unknown";
}

export function isSameBranch(a: string | undefined, b: string | undefined): boolean {
    if (!a || !b) {
        return false;
    }
    return a === b || a.endsWith(`/${b}`) || b.endsWith(`/${a}`);
}

/**
 * Resolves the integration branch to compare against for the current HEAD.
 */
export async function resolveBaseBranch(repository: Repository): Promise<ResolvedBaseBranch | undefined> {
    const head = repository.state.HEAD;
    if (!head?.name) {
        return undefined;
    }

    try {
        const base = await repository.getBranchBase(head.name);
        if (base && base.name && !isSameBranch(head.name, formatBranchName(base))) {
            return {
                name: formatBranchName(base),
                ref: base.commit ?? formatBranchName(base),
            };
        }
    } catch {
        // fall through to candidates
    }

    for (const candidate of FALLBACK_CANDIDATES) {
        try {
            const branch = await repository.getBranch(candidate);
            if (!isSameBranch(head.name, candidate)) {
                return {
                    name: candidate,
                    ref: branch.commit ?? candidate,
                };
            }
        } catch {
            continue;
        }
    }

    return undefined;
}

export async function resolveMergeBaseSha(
    repository: Repository,
    base: ResolvedBaseBranch
): Promise<string | undefined> {
    try {
        return await repository.getMergeBase(base.ref, "HEAD");
    } catch {
        return base.ref;
    }
}
