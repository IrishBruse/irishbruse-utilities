import { describe, expect, it } from "vitest";
import { formatPrTitleFromTicket, listBoardTicketsForPick } from "./jiraPrTitle";
import type { SyncedJiraBoard } from "./jiraWorkspace";

const sampleBoard: SyncedJiraBoard = {
    syncedAt: "2026-07-19T12:00:00.000Z",
    sections: {
        myTickets: {
            heading: "My tickets",
            statuses: {
                todo: [{ key: "PROJ-123", summary: "Add Jira row", assignee: "me" }],
                inProgress: [],
                codeReview: [],
                inTest: [],
                done: [],
            },
        },
        teammates: {
            heading: "Teammates",
            statuses: {
                todo: [],
                inProgress: [
                    {
                        key: "PROJ-456",
                        summary: "PROJ-456 Already prefixed",
                        assignee: "bob",
                    },
                ],
                codeReview: [],
                inTest: [],
                done: [],
            },
        },
        unassigned: {
            heading: "Unassigned",
            statuses: {
                todo: [],
                inProgress: [],
                codeReview: [],
                inTest: [],
                done: [],
            },
        },
        misc: {
            heading: "Misc",
            statuses: {
                todo: [],
                inProgress: [],
                codeReview: [],
                inTest: [],
                done: [],
            },
        },
    },
};

describe("formatPrTitleFromTicket", () => {
    it("prefixes the ticket key before the summary", () => {
        expect(formatPrTitleFromTicket("PROJ-123", "Add Jira row")).toBe("PROJ-123 Add Jira row");
    });

    it("keeps summaries that already start with the key", () => {
        expect(formatPrTitleFromTicket("PROJ-456", "PROJ-456 Already prefixed")).toBe(
            "PROJ-456 Already prefixed"
        );
    });
});

describe("listBoardTicketsForPick", () => {
    it("lists tickets in board section order", () => {
        expect(listBoardTicketsForPick(sampleBoard).map((row) => row.key)).toEqual(["PROJ-123", "PROJ-456"]);
    });
});
