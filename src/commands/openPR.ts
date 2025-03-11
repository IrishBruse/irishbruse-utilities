import { spawn } from "child_process";
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
            asyncSpawn("git", ["remote", "get-url", "origin"], { cwd: repoPath }),
            asyncSpawn("git", ["ls-remote", "origin", "refs/pull/*/head"], { cwd: repoPath }),
            asyncSpawn("git", ["rev-parse", "HEAD"], { cwd: repoPath }),
        ]);
    } catch (error) {
        window.showErrorMessage("Failed to run git commands ", (error as Error).message);
        return;
    }

    const [repoUrlProcess, prNumberProcess, commitHashProcess] = commands;

    // Get repository URL
    if (repoUrlProcess.status !== 0) {
        window.showErrorMessage("Failed to get remote repository URL.");
        return;
    }
    let repoUrl = repoUrlProcess.stdout.toString().trim();

    if (repoUrl.endsWith(".git")) {
        repoUrl = repoUrl.slice(0, repoUrl.length - 4);
    }

    // Get PR number
    if (prNumberProcess.status !== 0) {
        window.showErrorMessage("Failed to fetch PRs from remote.");
        return;
    }

    const prList = prNumberProcess.stdout.toString().split("\n");

    const commitHash = commitHashProcess.stdout.toString().trim();

    const prEntry = prList.find((line) => line.includes(commitHash));
    if (!prEntry) {
        env.openExternal(Uri.parse(repoUrl));
        return;
    }

    const prNumber = prEntry.split("/")[2];

    // Open the PR URL
    const prUrl = `${repoUrl}/pull/${prNumber}`;
    env.openExternal(Uri.parse(prUrl));
}
