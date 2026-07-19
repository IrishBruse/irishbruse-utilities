const TITLE_SEPARATORS = /^[\s:—\-–]+/;

export function escapeRegExp(value: string): string {
    return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function extractJiraKeyFromTitle(title: string, keyPattern: RegExp): string | undefined {
    const match = title.trim().match(new RegExp(`^(${keyPattern.source})\\b`));
    return match?.[1];
}

export function extractJiraKeyFromBranch(branch: string, keyPattern: RegExp): string | undefined {
    const match = branch.match(new RegExp(`(?:^|/|-)(${keyPattern.source})(?:-|/|$)`));
    return match?.[1];
}

export function resolveJiraKey(
    title: string | undefined,
    branch: string | undefined,
    keyPattern: RegExp
): { key: string; source: "title" | "branch" } | undefined {
    if (title) {
        const fromTitle = extractJiraKeyFromTitle(title, keyPattern);
        if (fromTitle) {
            return { key: fromTitle, source: "title" };
        }
    }

    if (branch) {
        const fromBranch = extractJiraKeyFromBranch(branch, keyPattern);
        if (fromBranch) {
            return { key: fromBranch, source: "branch" };
        }
    }

    return undefined;
}

export function summaryFromPrTitle(title: string, key: string, maxLength = 80): string | undefined {
    const remainder = title
        .trim()
        .replace(new RegExp(`^${escapeRegExp(key)}\\b`), "")
        .replace(TITLE_SEPARATORS, "")
        .trim();
    if (!remainder) {
        return undefined;
    }
    if (remainder.length <= maxLength) {
        return remainder;
    }
    return `${remainder.slice(0, maxLength - 3)}...`;
}
