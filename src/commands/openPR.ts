import { env, SourceControl, Uri, window } from "vscode";
import { asyncSpawn, Process } from "../utils/asyncSpawn";
import { resolveRepositoryPath } from "../git/resolveRepositoryPath";

export async function openPR(sourceControl?: SourceControl, repoPath?: string): Promise<void> {
    const resolvedPath = repoPath ?? (await resolveRepositoryPath(sourceControl));
    if (!resolvedPath) {
        window.showWarningMessage("Could not determine repository path.");
        return;
    }

    let commands: Process[] = [];

    try {
        commands = await Promise.all([
            asyncSpawn("gh", ["pr", "view", "--json", "number", "--jq", ".number"], { cwd: resolvedPath }),
            asyncSpawn("git", ["remote", "get-url", "origin"], { cwd: resolvedPath }),
        ]);
    } catch (error) {
        window.showErrorMessage("Failed to run git commands ", (error as Error).message);
        return;
    }

    const prNumber = commands[0].stdout.trim();
    const remoteUrl = commands[1].stdout.trim().replace(".git", "");

    let prUrl = `${remoteUrl}/pull/${prNumber}`;
    if (commands[0].status !== 0) {
        env.openExternal(Uri.parse(remoteUrl));
        return;
    }

    env.openExternal(Uri.parse(prUrl));
}
