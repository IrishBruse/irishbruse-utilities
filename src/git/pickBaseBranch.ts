import { QuickPickItem, window } from "vscode";
import { getBaseBranchOverride, setBaseBranchOverride } from "./baseBranchOverride";
import { getRepositoryByRoot } from "./getGitApi";
import { listGitRefs } from "./listGitRefs";
import { resolveAutoBaseBranch, resolveRefTarget } from "./resolveBaseBranch";
import { getActiveRepository } from "./resolveActiveRepository";
import { refreshGitHelpersView } from "../gitHelpers/refresh";

type BaseBranchPickItem = QuickPickItem & {
    kind: "auto" | "ref" | "custom";
    ref?: string;
};

export async function pickBaseBranchTarget(repoRoot?: string): Promise<void> {
    const repository = repoRoot ? getRepositoryByRoot(repoRoot) : await getActiveRepository();
    if (!repository) {
        window.showWarningMessage("No active git repository. Select one in Source Control.");
        return;
    }

    const activeRepoRoot = repository.rootUri.fsPath;
    const auto = await resolveAutoBaseBranch(repository);
    const currentOverride = getBaseBranchOverride(activeRepoRoot);
    const headName = repository.state.HEAD?.name;
    const refs = (await listGitRefs(activeRepoRoot)).filter((ref) => ref !== headName);

    const items: BaseBranchPickItem[] = [];
    if (auto) {
        items.push({
            kind: "auto",
            label: "$(sparkle) Auto",
            description: auto.name,
            detail: "Use upstream or main/master detection",
            picked: !currentOverride,
        });
    }

    for (const ref of refs) {
        items.push({
            kind: "ref",
            ref,
            label: ref,
            picked: ref === currentOverride,
        });
    }

    items.push({
        kind: "custom",
        label: "$(edit) Enter branch or commit...",
        alwaysShow: true,
    });

    const selection = await window.showQuickPick(items, {
        title: "Compare against",
        placeHolder: currentOverride ?? auto?.name ?? "Select a base branch",
        matchOnDescription: true,
    });
    if (!selection) {
        return;
    }

    if (selection.kind === "auto") {
        await setBaseBranchOverride(activeRepoRoot, undefined);
        refreshGitHelpersView();
        return;
    }

    if (selection.kind === "custom") {
        const custom = await window.showInputBox({
            title: "Compare against",
            prompt: "Branch name, remote branch, tag, or commit SHA",
            value: currentOverride ?? auto?.name,
            validateInput: (value) => (value.trim() ? undefined : "Enter a branch or commit."),
        });
        if (!custom?.trim()) {
            return;
        }

        const resolved = await resolveRefTarget(repository, activeRepoRoot, custom.trim());
        if (!resolved) {
            window.showWarningMessage(`Could not resolve "${custom.trim()}".`);
            return;
        }

        await setBaseBranchOverride(activeRepoRoot, custom.trim());
        refreshGitHelpersView();
        return;
    }

    if (selection.ref) {
        await setBaseBranchOverride(activeRepoRoot, selection.ref);
        refreshGitHelpersView();
    }
}
