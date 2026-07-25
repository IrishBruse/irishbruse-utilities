import path from "path";
import { Uri } from "vscode";
import { asyncSpawn } from "../utils/asyncSpawn";
import { getGitApi } from "./getGitApi";

async function gitToplevelFrom(cwd: string): Promise<string | undefined> {
    try {
        const result = await asyncSpawn("git", ["rev-parse", "--show-toplevel"], { cwd });
        if (result.status === 0) {
            return result.stdout.trim();
        }
    } catch {
        return undefined;
    }
    return undefined;
}

export function gitRepositoryRootForUriSync(uri: Uri): string | undefined {
    return getGitApi()?.getRepository(uri)?.rootUri.fsPath;
}

export async function gitRepositoryRootForUri(uri: Uri): Promise<string | undefined> {
    const fromGitExtension = gitRepositoryRootForUriSync(uri);
    if (fromGitExtension) {
        return fromGitExtension;
    }
    const parentDir = path.dirname(uri.fsPath);
    if (!parentDir || parentDir === uri.fsPath) {
        return undefined;
    }
    return gitToplevelFrom(parentDir);
}

export function relativePathFromRepoRoot(fileUri: Uri, repoRoot: string): string {
    return path.relative(repoRoot, fileUri.fsPath).replace(/\\/g, "/");
}

/** True when the string is a useful relative path, not the full filesystem path. */
export function pathLooksRelative(relativeCandidate: string, absoluteFsPath: string): boolean {
    if (!relativeCandidate) {
        return false;
    }
    if (path.isAbsolute(relativeCandidate)) {
        return false;
    }
    return path.normalize(relativeCandidate) !== path.normalize(absoluteFsPath);
}
