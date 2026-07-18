import { asyncSpawn } from "../utils/asyncSpawn";

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

export async function getPrWebUrl(repoRoot: string): Promise<string | undefined> {
    try {
        const result = await asyncSpawn("gh", ["pr", "view", "--json", "url"], { cwd: repoRoot });
        if (result.status !== 0) {
            return undefined;
        }
        try {
            const parsed = JSON.parse(result.stdout) as { url?: string };
            return parsed.url?.trim() || undefined;
        } catch {
            return undefined;
        }
    } catch {
        return undefined;
    }
}
