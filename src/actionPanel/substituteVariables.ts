import type { ActionPanelContext } from "./types";

export function substituteVariables(template: string, context: ActionPanelContext): string {
    return template
        .replaceAll("${repoRoot}", context.repoRoot)
        .replaceAll("${branch}", context.branch ?? "")
        .replaceAll("${baseBranch}", context.baseBranch ?? "")
        .replaceAll("${file}", context.file)
        .replaceAll("${selection}", context.selection);
}
