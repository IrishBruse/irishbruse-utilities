import { asyncSpawn } from "../utils/asyncSpawn";
import { runGh } from "./ghCli";

export { runGh };

const PR_JSON_FIELDS = "number,title,headRefOid,url,state,isDraft,additions,deletions,changedFiles";

function parsePrInfo(stdout: string): GhPrInfo | undefined {
    try {
        const parsed = JSON.parse(stdout) as (GhPrInfo & { state?: string }) | (GhPrInfo & { state?: string })[];
        const pr = Array.isArray(parsed) ? parsed[0] : parsed;
        if (!pr?.number) {
            return undefined;
        }
        if (pr.state && pr.state !== "OPEN") {
            return undefined;
        }
        return {
            number: pr.number,
            title: pr.title,
            headRefOid: pr.headRefOid,
            url: pr.url,
            isDraft: pr.isDraft ?? false,
            additions: pr.additions ?? 0,
            deletions: pr.deletions ?? 0,
            changedFiles: pr.changedFiles ?? 0,
        };
    } catch {
        return undefined;
    }
}

export function parseGithubOwnerRepo(remoteUrl: string): { owner: string; repo: string } | undefined {
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

export function githubRepoWebUrl(remoteUrl: string): string | undefined {
    const parsed = parseGithubOwnerRepo(remoteUrl);
    if (!parsed) {
        return undefined;
    }
    return `https://github.com/${parsed.owner}/${parsed.repo}`;
}

export async function getOriginUrl(repoRoot: string): Promise<string | undefined> {
    const result = await asyncSpawn("git", ["remote", "get-url", "origin"], { cwd: repoRoot });
    if (result.status !== 0) {
        return undefined;
    }
    return result.stdout.trim();
}

export type GhPrInfo = {
    number: number;
    title: string;
    headRefOid: string;
    url: string;
    isDraft: boolean;
    additions: number;
    deletions: number;
    changedFiles: number;
};

export function formatPrFileChangeLabel(changedFiles: number): string {
    return changedFiles === 1 ? "1 file" : `${changedFiles} files`;
}

export function formatPrLineChangeDescription(additions: number, deletions: number): string {
    return `+${additions} −${deletions}`;
}

export function getPrChangesUrl(prUrl: string): string {
    return `${prUrl.replace(/\/$/, "")}/changes`;
}

export async function getPrInfo(repoRoot: string, branch?: string): Promise<GhPrInfo | undefined> {
    const viewArgs = branch
        ? ["pr", "view", branch, "--json", PR_JSON_FIELDS]
        : ["pr", "view", "--json", PR_JSON_FIELDS];
    const view = await runGh(repoRoot, viewArgs);
    if (view?.status === 0) {
        const pr = parsePrInfo(view.stdout);
        if (pr) {
            return pr;
        }
    }

    if (!branch) {
        return undefined;
    }

    const list = await runGh(repoRoot, [
        "pr",
        "list",
        "--head",
        branch,
        "--state",
        "open",
        "--json",
        PR_JSON_FIELDS,
        "--limit",
        "1",
    ]);
    if (list?.status === 0) {
        const pr = parsePrInfo(list.stdout);
        if (pr) {
            return pr;
        }
    }

    const origin = await getOriginUrl(repoRoot);
    const github = origin ? parseGithubOwnerRepo(origin) : undefined;
    if (!github) {
        return undefined;
    }

    const listWithOwner = await runGh(repoRoot, [
        "pr",
        "list",
        "--head",
        `${github.owner}:${branch}`,
        "--state",
        "open",
        "--json",
        PR_JSON_FIELDS,
        "--limit",
        "1",
    ]);
    if (listWithOwner?.status === 0) {
        return parsePrInfo(listWithOwner.stdout);
    }

    return undefined;
}

export async function getPrWebUrl(repoRoot: string, branch?: string): Promise<string | undefined> {
    const pr = await getPrInfo(repoRoot, branch);
    return pr?.url;
}
