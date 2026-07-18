import { commands, Uri, window } from "vscode";
import { getRepositoryByRoot } from "./getGitApi";
import { toMultiFileDiffEditorUris } from "./gitUri";
import { resolveBaseBranch, resolveMergeBaseSha } from "./resolveBaseBranch";

export async function openBranchDiff(repoRoot: string): Promise<void> {
    const repository = getRepositoryByRoot(repoRoot);
    if (!repository) {
        window.showWarningMessage("Git repository not found.");
        return;
    }

    const head = repository.state.HEAD;
    if (!head?.name) {
        window.showWarningMessage("Repository has no current branch.");
        return;
    }

    const base = await resolveBaseBranch(repository);
    if (!base) {
        window.showWarningMessage("Could not determine a base branch.");
        return;
    }

    if (head.name === base.name || head.name === base.name.split("/").pop()) {
        window.showInformationMessage(`Already on ${base.name}.`);
        return;
    }

    const mergeBase = (await resolveMergeBaseSha(repository, base)) ?? base.ref;

    try {
        const changes = await repository.diffBetweenWithStats(mergeBase, "HEAD");
        if (changes.length === 0) {
            window.showInformationMessage(`No changes between ${base.name} and ${head.name}.`);
            return;
        }

        const multiDiffSourceUri = Uri.from({
            scheme: "git-ref-compare",
            path: `${repository.rootUri.fsPath}/${mergeBase}..HEAD`,
        });
        const resources = changes.map((change) => toMultiFileDiffEditorUris(change, mergeBase, "HEAD"));

        await commands.executeCommand("_workbench.openMultiDiffEditor", {
            multiDiffSourceUri,
            title: `${base.name} ↔ ${head.name}`,
            resources,
        });
    } catch (error) {
        window.showErrorMessage(`Failed to open branch diff: ${(error as Error).message}`);
    }
}
