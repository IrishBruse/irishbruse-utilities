import { describe, expect, it } from "vitest";
import {
    findBoardTicket,
    getJiraBrowseUrl,
    parseSyncedJiraBoard,
    type SyncedJiraBoard,
} from "./jiraWorkspace";

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
                inProgress: [],
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

describe("parseSyncedJiraBoard", () => {
    it("parses a synced board cache file", () => {
        expect(parseSyncedJiraBoard(JSON.stringify(sampleBoard))).toEqual(sampleBoard);
    });

    it("rejects invalid board cache payloads", () => {
        expect(parseSyncedJiraBoard("{}")).toBeNull();
        expect(parseSyncedJiraBoard("not json")).toBeNull();
    });
});

describe("findBoardTicket", () => {
    it("finds a ticket by key in the synced board", () => {
        expect(findBoardTicket(sampleBoard, "PROJ-123")).toEqual({
            key: "PROJ-123",
            summary: "Add Jira row",
            assignee: "me",
        });
    });
});

describe("getJiraBrowseUrl", () => {
    it("builds a browse URL from the configured site host", () => {
        expect(getJiraBrowseUrl("company.atlassian.net", "PROJ-123")).toBe(
            "https://company.atlassian.net/browse/PROJ-123"
        );
    });
});
