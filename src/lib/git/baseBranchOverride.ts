import type { ExtensionContext, Memento } from "vscode";

const OVERRIDE_KEY = "gitHelpers.baseBranchOverrides";

let workspaceState: Memento | undefined;

export function registerBaseBranchOverrideStorage(context: ExtensionContext): void {
    workspaceState = context.workspaceState;
}

function normalizeRepoRoot(repoRoot: string): string {
    return repoRoot.replace(/\\/g, "/");
}

export function getBaseBranchOverride(repoRoot: string): string | undefined {
    const overrides = workspaceState?.get<Record<string, string>>(OVERRIDE_KEY) ?? {};
    return overrides[normalizeRepoRoot(repoRoot)];
}

export async function setBaseBranchOverride(repoRoot: string, ref: string | undefined): Promise<void> {
    if (!workspaceState) {
        return;
    }

    const key = normalizeRepoRoot(repoRoot);
    const overrides = { ...(workspaceState.get<Record<string, string>>(OVERRIDE_KEY) ?? {}) };
    if (ref) {
        overrides[key] = ref;
    } else {
        delete overrides[key];
    }
    await workspaceState.update(OVERRIDE_KEY, overrides);
}
