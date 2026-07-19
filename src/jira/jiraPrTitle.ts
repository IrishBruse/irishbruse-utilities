import type { SyncedJiraBoard } from "./jiraWorkspace";

type StatusBucket = "todo" | "inProgress" | "codeReview" | "inTest" | "done";

const STATUS_BUCKETS: StatusBucket[] = ["todo", "inProgress", "codeReview", "inTest", "done"];
const SECTION_KEYS: (keyof SyncedJiraBoard["sections"])[] = [
    "myTickets",
    "teammates",
    "unassigned",
    "misc",
];

export type BoardTicketPickEntry = {
    key: string;
    summary: string;
    assignee: string;
    sectionHeading: string;
    statusLabel: string;
};

const STATUS_LABELS: Record<StatusBucket, string> = {
    todo: "Todo",
    inProgress: "In progress",
    codeReview: "Code review",
    inTest: "In test",
    done: "Done",
};

/** Flatten synced board tickets in board display order for quick pick. */
export function listBoardTicketsForPick(board: SyncedJiraBoard): BoardTicketPickEntry[] {
    const rows: BoardTicketPickEntry[] = [];
    for (const sectionKey of SECTION_KEYS) {
        const section = board.sections[sectionKey];
        for (const bucket of STATUS_BUCKETS) {
            for (const ticket of section.statuses[bucket]) {
                rows.push({
                    key: ticket.key,
                    summary: ticket.summary,
                    assignee: ticket.assignee,
                    sectionHeading: section.heading,
                    statusLabel: STATUS_LABELS[bucket],
                });
            }
        }
    }
    return rows;
}

/** Build a PR title with the Jira key at the start. */
export function formatPrTitleFromTicket(key: string, summary: string): string {
    const trimmedSummary = summary.trim();
    const normalizedKey = key.trim();
    if (!trimmedSummary) {
        return normalizedKey;
    }

    const upperKey = normalizedKey.toUpperCase();
    const upperSummary = trimmedSummary.toUpperCase();
    if (upperSummary === upperKey || upperSummary.startsWith(`${upperKey} `) || upperSummary.startsWith(`${upperKey}:`)) {
        return trimmedSummary;
    }

    return `${normalizedKey} ${trimmedSummary}`;
}
