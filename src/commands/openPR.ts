import { execSync, spawnSync } from "child_process";
import { SourceControl, window } from "vscode";

export function openPR(sourceControl: SourceControl) {
    if (!sourceControl || !sourceControl.rootUri) {
        window.showWarningMessage("Could not determine repository path.");
        return;
    }

    const repoPath = sourceControl.rootUri.fsPath;

    const prView = spawnSync("gh", ["pr", "view"], {
        cwd: repoPath,
    });

    if (prView.status !== 0) {
        const browse = spawnSync("gh", ["browse"], {
            cwd: repoPath,
        });

        if (browse.error) {
            window.showErrorMessage(browse.error.message);
        }
    }
}
