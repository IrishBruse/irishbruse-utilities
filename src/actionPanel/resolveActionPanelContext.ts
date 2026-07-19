import { workspace } from "vscode";
import { getActiveRepository } from "../git/resolveActiveRepository";
import { resolveBaseBranch } from "../git/resolveBaseBranch";
import { resolveEditorContext } from "./resolveEditorContext";
import type { ActionPanelContext } from "./types";

export async function resolveActionPanelContext(): Promise<ActionPanelContext> {
    const fallbackRoot = workspace.workspaceFolders?.[0]?.uri.fsPath ?? "";
    const editorContext = resolveEditorContext();
    const repository = await getActiveRepository();
    if (!repository) {
        return { repoRoot: fallbackRoot, ...editorContext };
    }

    const base = await resolveBaseBranch(repository);
    return {
        repoRoot: repository.rootUri.fsPath,
        branch: repository.state.HEAD?.name,
        baseBranch: base?.name,
        ...editorContext,
    };
}
