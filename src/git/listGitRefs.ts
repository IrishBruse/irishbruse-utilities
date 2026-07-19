import { asyncSpawn } from "../utils/asyncSpawn";

export async function listGitRefs(repoRoot: string): Promise<string[]> {
    const result = await asyncSpawn(
        "git",
        [
            "for-each-ref",
            "--sort=-committerdate",
            "--format=%(refname:short)",
            "refs/heads",
            "refs/remotes",
        ],
        { cwd: repoRoot }
    );
    if (result.status !== 0) {
        return [];
    }

    const seen = new Set<string>();
    const refs: string[] = [];
    for (const line of result.stdout.split("\n")) {
        const ref = line.trim();
        if (!ref || ref === "HEAD" || ref.endsWith("/HEAD") || seen.has(ref)) {
            continue;
        }
        seen.add(ref);
        refs.push(ref);
    }
    return refs;
}
