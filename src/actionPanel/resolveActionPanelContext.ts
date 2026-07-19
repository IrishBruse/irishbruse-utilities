import { workspace } from "vscode";
import { getActiveRepository } from "../git/resolveActiveRepository";
import { resolveBaseBranch } from "../git/resolveBaseBranch";
import type { ActionPanelContext } from "./types";

export async function resolveActionPanelContext(): Promise<ActionPanelContext> {
    const fallbackRoot = workspace.workspaceFolders?.[0]?.uri.fsPath ?? "";
    const repository = await getActiveRepository();
    if (!repository) {
        return { repoRoot: fallbackRoot };
    }

    const base = await resolveBaseBranch(repository);
    return {
        repoRoot: repository.rootUri.fsPath,
        branch: repository.state.HEAD?.name,
        baseBranch: base?.name,
    };
}
