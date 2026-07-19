import { QuickPickItem, QuickPickItemKind, window } from "vscode";
import { extractJiraKeyFromTitle } from "./jiraKey";
import { formatPrTitleFromTicket, listBoardTicketsForPick } from "./jiraPrTitle";
import type { SyncedJiraBoard } from "./jiraWorkspace";

type JiraTicketPickItem = QuickPickItem & {
    prTitle: string;
};

export async function pickJiraTicketPrTitle(
    board: SyncedJiraBoard,
    currentTitle?: string
): Promise<string | undefined> {
    const entries = listBoardTicketsForPick(board);
    if (entries.length === 0) {
        window.showWarningMessage("No tickets on the synced Jira board.");
        return undefined;
    }

    const currentKey = currentTitle ? extractJiraKeyFromTitle(currentTitle, /[A-Z][A-Z0-9_]*-\d+/) : undefined;
    const items: Array<JiraTicketPickItem | QuickPickItem> = [];
    let lastSection = "";

    for (const entry of entries) {
        if (entry.sectionHeading !== lastSection) {
            lastSection = entry.sectionHeading;
            items.push({
                kind: QuickPickItemKind.Separator,
                label: entry.sectionHeading,
            });
        }

        const prTitle = formatPrTitleFromTicket(entry.key, entry.summary);
        const pickItem: JiraTicketPickItem = {
            label: prTitle,
            description: entry.key,
            detail: entry.assignee ? `${entry.statusLabel} · ${entry.assignee}` : entry.statusLabel,
            prTitle,
            picked: currentKey?.toUpperCase() === entry.key.toUpperCase(),
        };
        items.push(pickItem);
    }

    const selection = await window.showQuickPick(items, {
        title: "Set PR title from Jira ticket",
        placeHolder: "Pick a ticket — the PR title will start with its key",
        matchOnDescription: true,
        matchOnDetail: true,
    });

    if (!selection || !("prTitle" in selection)) {
        return undefined;
    }

    return (selection as JiraTicketPickItem).prTitle;
}
