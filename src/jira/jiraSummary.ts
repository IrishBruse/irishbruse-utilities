import { readdir, readFile } from "fs/promises";
import path from "path";
import { asyncSpawn } from "../utils/asyncSpawn";
import { findBoardTicket, type SyncedJiraBoard } from "./jiraWorkspace";

const SUMMARY_CACHE_TTL_MS = 5 * 60 * 1000;
const JIRA_URL_BROWSE_RE = /\/browse\/([A-Za-z][A-Za-z0-9_]*-\d+)/i;

type CachedSummary = {
    summary: string | undefined;
    fetchedAt: number;
};

const summaryCache = new Map<string, CachedSummary>();

function cacheKey(repoRoot: string, issueKey: string): string {
    return `${repoRoot}:${issueKey}`;
}

function readCachedSummary(repoRoot: string, issueKey: string): string | undefined | null {
    const cached = summaryCache.get(cacheKey(repoRoot, issueKey));
    if (!cached) {
        return null;
    }
    if (Date.now() - cached.fetchedAt > SUMMARY_CACHE_TTL_MS) {
        summaryCache.delete(cacheKey(repoRoot, issueKey));
        return null;
    }
    return cached.summary;
}

function storeCachedSummary(repoRoot: string, issueKey: string, summary: string | undefined): void {
    summaryCache.set(cacheKey(repoRoot, issueKey), { summary, fetchedAt: Date.now() });
}

function parseFrontmatterTitle(content: string): string | undefined {
    const match = content.match(/^---\s*\n([\s\S]*?)\n---/);
    if (!match) {
        return undefined;
    }
    const frontmatter = match[1];
    const titleMatch = /^title:\s*(.+)$/m.exec(frontmatter);
    if (!titleMatch) {
        return undefined;
    }
    try {
        return (JSON.parse(titleMatch[1]) as string).trim() || undefined;
    } catch {
        return titleMatch[1].trim() || undefined;
    }
}

function parseFrontmatterUrl(content: string): string | undefined {
    const match = content.match(/^---\s*\n([\s\S]*?)\n---/);
    if (!match) {
        return undefined;
    }
    const urlMatch = /^url:\s*(\S+)$/m.exec(match[1]);
    return urlMatch?.[1]?.trim();
}

function issueKeyFromMarkdown(content: string): string | undefined {
    const url = parseFrontmatterUrl(content);
    if (!url) {
        return undefined;
    }
    const match = url.match(JIRA_URL_BROWSE_RE);
    return match?.[1]?.toUpperCase();
}

async function readLocalJiraSummary(repoRoot: string, issueKey: string): Promise<string | undefined> {
    const root = path.join(repoRoot, "jira");
    let entries: string[];
    try {
        entries = await readdir(root, { withFileTypes: true }).then((rows) =>
            rows.filter((row) => row.isDirectory()).map((row) => row.name)
        );
    } catch {
        return undefined;
    }

    const normalizedKey = issueKey.toUpperCase();
    for (const typeDir of entries) {
        const typePath = path.join(root, typeDir);
        let files: string[];
        try {
            files = await readdir(typePath);
        } catch {
            continue;
        }

        for (const fileName of files) {
            if (!fileName.endsWith(".md")) {
                continue;
            }
            const filePath = path.join(typePath, fileName);
            let content: string;
            try {
                content = await readFile(filePath, "utf8");
            } catch {
                continue;
            }
            if (issueKeyFromMarkdown(content) !== normalizedKey) {
                continue;
            }
            return parseFrontmatterTitle(content);
        }
    }

    return undefined;
}

async function readJiraCliSummary(repoRoot: string, issueKey: string): Promise<string | undefined> {
    try {
        const result = await asyncSpawn("jira", ["show", issueKey], { cwd: repoRoot });
        if (result.status !== 0) {
            return undefined;
        }

        const frontmatterTitle = parseFrontmatterTitle(result.stdout);
        if (frontmatterTitle) {
            return frontmatterTitle;
        }

        const firstLine = result.stdout
            .split("\n")
            .map((line) => line.trim())
            .find((line) => line.length > 0);
        return firstLine;
    } catch {
        return undefined;
    }
}

export async function resolveJiraSummary(
    repoRoot: string,
    issueKey: string,
    board: SyncedJiraBoard | undefined,
    prTitleFallback?: string
): Promise<string | undefined> {
    const cached = readCachedSummary(repoRoot, issueKey);
    if (cached !== null) {
        return cached ?? prTitleFallback;
    }

    const boardSummary = board ? findBoardTicket(board, issueKey)?.summary.trim() : undefined;
    if (boardSummary) {
        storeCachedSummary(repoRoot, issueKey, boardSummary);
        return boardSummary;
    }

    const localSummary = await readLocalJiraSummary(repoRoot, issueKey);
    if (localSummary) {
        storeCachedSummary(repoRoot, issueKey, localSummary);
        return localSummary;
    }

    const cliSummary = await readJiraCliSummary(repoRoot, issueKey);
    if (cliSummary) {
        storeCachedSummary(repoRoot, issueKey, cliSummary);
        return cliSummary;
    }

    storeCachedSummary(repoRoot, issueKey, undefined);
    return prTitleFallback;
}
