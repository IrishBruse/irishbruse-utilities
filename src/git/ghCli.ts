import { workspace } from "vscode";
import type { Process } from "../utils/asyncSpawn";
import { asyncSpawn, type AsyncSpawnOptions } from "../utils/asyncSpawn";

const DEFAULT_GH_COMMAND = "gh";

export function getGhCommand(): string {
    const configured = workspace.getConfiguration("ib-utilities").get<string>("github.ghPath");
    if (typeof configured === "string") {
        const trimmed = configured.trim();
        if (trimmed) {
            return trimmed;
        }
    }
    return DEFAULT_GH_COMMAND;
}

export function ghSpawnEnv(): NodeJS.ProcessEnv {
    const env = { ...process.env };
    if (process.platform !== "win32") {
        const pathValue = env.PATH ?? "";
        if (!pathValue.split(":").includes("/usr/bin")) {
            env.PATH = `/usr/local/bin:/usr/bin:${pathValue}`;
        }
    }
    return env;
}

export function ghSpawnOptions(
    repoRoot: string,
    extra: Omit<AsyncSpawnOptions, "cwd" | "env"> = {}
): AsyncSpawnOptions {
    return { cwd: repoRoot, env: ghSpawnEnv(), ...extra };
}

export async function spawnGh(
    repoRoot: string,
    args: readonly string[],
    options: Omit<AsyncSpawnOptions, "cwd" | "env"> = {}
): Promise<Process> {
    return asyncSpawn(getGhCommand(), args, ghSpawnOptions(repoRoot, options));
}

export async function runGh(repoRoot: string, args: readonly string[]): Promise<Process | undefined> {
    try {
        return await spawnGh(repoRoot, args);
    } catch {
        return undefined;
    }
}
