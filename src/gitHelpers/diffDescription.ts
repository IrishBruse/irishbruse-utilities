import { formatPrFileChangeLabel, formatPrLineChangeDescription } from "../lib/git/githubUrl";
import type { BranchChangesSummary } from "./loadBranchChanges";

export function formatDiffTreeDescription(
    baseBranchName: string,
    summary?: BranchChangesSummary,
): string {
    if (!summary) {
        return baseBranchName;
    }
    return `${formatPrFileChangeLabel(summary.changedFiles)} · ${formatPrLineChangeDescription(summary.additions, summary.deletions)}`;
}
