export type RepoChildrenCacheEntry<T> = {
    children: T[];
    signature: string;
    checksUrl?: string;
};

type CacheableChild = {
    id?: string;
    repoRoot?: string;
};

export function isCacheableGitHelperChildren(children: readonly CacheableChild[]): boolean {
    if (children.length === 0) {
        return false;
    }
    if (children.some((item) => item.id === "info:loading")) {
        return false;
    }
    return children.some((item) => item.repoRoot);
}

export class RepoChildrenCache<T extends CacheableChild> {
    private entries = new Map<string, RepoChildrenCacheEntry<T>>();

    get(repoRoot: string): RepoChildrenCacheEntry<T> | undefined {
        return this.entries.get(repoRoot);
    }

    set(repoRoot: string, children: T[], signature: string, checksUrl?: string): void {
        if (!isCacheableGitHelperChildren(children)) {
            return;
        }
        const entry: RepoChildrenCacheEntry<T> = { children, signature };
        if (checksUrl) {
            entry.checksUrl = checksUrl;
        }
        this.entries.set(repoRoot, entry);
    }

    delete(repoRoot: string): void {
        this.entries.delete(repoRoot);
    }

    clear(): void {
        this.entries.clear();
    }
}
