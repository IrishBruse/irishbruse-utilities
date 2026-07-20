import { TreeItemCollapsibleState } from "vscode";
import { Commands } from "../constants";
import type { PrCheckStatus } from "../git/prChecks";
import { GitHelperTreeItem } from "./GitHelperTreeItem";

export function checksTreeItem(repoRoot: string, prNumber: number, checkStatus: PrCheckStatus): GitHelperTreeItem {
    const item = new GitHelperTreeItem(
        "action",
        repoRoot,
        checkStatus.label,
        TreeItemCollapsibleState.None,
        `${repoRoot}:openPrChecks:${prNumber}`,
        "openPrChecks",
        checkStatus.description,
        {
            command: Commands.OpenPrChecks,
            title: "Open PR checks",
            arguments: [repoRoot],
        }
    );
    item.checksUrl = checkStatus.url;
    item.contextValue = checkStatus.isFailing ? "action-openPrChecks-failing" : "action-openPrChecks";
    return item;
}
