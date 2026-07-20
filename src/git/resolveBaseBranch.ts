import type { Branch, Repository } from "./gitApi";
import { asyncSpawn } from "../utils/asyncSpawn";
import { getBaseBranchOverride } from "./baseBranchOverride";

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

export function isMainlineBranch(branch: string | undefined): boolean {
    if (!branch) {
        return false;
    }
    const name = branch.replace(/^origin\//, "");
    return name === "main" || name === "master";
}

export async function resolveRefTarget(
    repository: Repository,
    repoRoot: string,
    ref: string
): Promise<ResolvedBaseBranch | undefined> {
    const headName = repository.state.HEAD?.name;
    if (isSameBranch(headName, ref)) {
        return undefined;
    }

    try {
        const branch = await repository.getBranch(ref);
        return {
            name: formatBranchName(branch),
            ref: branch.commit ?? ref,
        };
    } catch {
        // fall through to raw ref resolution
    }

    const result = await asyncSpawn("git", ["rev-parse", "--verify", ref], { cwd: repoRoot });
    if (result.status !== 0) {
        return undefined;
    }

    const sha = result.stdout.trim();
    const name = sha.length >= 40 && ref.length >= 40 ? sha.slice(0, 7) : ref;
    return { name, ref: sha };
}

/**
 * Resolves the integration branch to compare against for the current HEAD.
 */
export async function resolveAutoBaseBranch(repository: Repository): Promise<ResolvedBaseBranch | undefined> {
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

export async function resolveBaseBranch(repository: Repository): Promise<ResolvedBaseBranch | undefined> {
    const override = getBaseBranchOverride(repository.rootUri.fsPath);
    if (override) {
        const resolved = await resolveRefTarget(repository, repository.rootUri.fsPath, override);
        if (resolved) {
            return resolved;
        }
    }

    return resolveAutoBaseBranch(repository);
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
