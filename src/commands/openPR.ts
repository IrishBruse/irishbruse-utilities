import { spawnSync } from "child_process";
import { env, SourceControl, Uri, window } from "vscode";

export function openPR(sourceControl: SourceControl) {
    if (!sourceControl || !sourceControl.rootUri) {
        window.showWarningMessage("Could not determine repository path.");
        return;
    }

    const repoPath = sourceControl.rootUri.fsPath;

    // Get repository URL
    const repoUrlProcess = spawnSync("git", ["remote", "get-url", "origin"], { cwd: repoPath });
    if (repoUrlProcess.status !== 0) {
        window.showErrorMessage("Failed to get remote repository URL.");
        return;
    }
    let repoUrl = repoUrlProcess.stdout.toString().trim();

    if (repoUrl.endsWith(".git")) {
        repoUrl = repoUrl.slice(0, repoUrl.length - 4);
    }

    // Get PR number
    const prNumberProcess = spawnSync("git", ["ls-remote", "origin", "refs/pull/*/head"], { cwd: repoPath });
    if (prNumberProcess.status !== 0) {
        window.showErrorMessage("Failed to fetch PRs from remote.");
        return;
    }

    const prList = prNumberProcess.stdout.toString().split("\n");

    const commitHashProcess = spawnSync("git", ["rev-parse", "HEAD"], { cwd: repoPath });
    const commitHash = commitHashProcess.stdout.toString().trim();

    const prEntry = prList.find((line) => line.includes(commitHash));
    if (!prEntry) {
        window.showWarningMessage("No open pull request found for this branch.");
        return;
    }

    const prNumber = prEntry.split("/")[2];

    // Open the PR URL
    const prUrl = `${repoUrl}/pull/${prNumber}`;
    env.openExternal(Uri.parse(prUrl));
}
