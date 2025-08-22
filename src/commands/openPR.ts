import { env, SourceControl, Uri, window } from "vscode";
import { asyncSpawn, Process } from "../utils/asyncSpawn";

export async function openPR(sourceControl: SourceControl) {
    if (!sourceControl || !sourceControl.rootUri) {
        window.showWarningMessage("Could not determine repository path.");
        return;
    }

    const repoPath = sourceControl.rootUri.fsPath;

    let commands: Process[] = [];

    try {
        commands = await Promise.all([
            asyncSpawn("gh", ["pr", "view", "--json", "number", "--jq", ".number"], { cwd: repoPath }),
            asyncSpawn("git", ["remote", "get-url", "origin"], { cwd: repoPath }),
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

    // Open the PR URL
    env.openExternal(Uri.parse(prUrl));
}
