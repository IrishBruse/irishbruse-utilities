import { mkdtemp, mkdir, writeFile } from "fs/promises";
import os from "os";
import path from "path";
import { afterEach, describe, expect, it } from "vitest";
import { resolveJiraSummary } from "./jiraSummary";
import type { SyncedJiraBoard } from "./jiraWorkspace";

const sampleBoard: SyncedJiraBoard = {
    syncedAt: "2026-07-19T12:00:00.000Z",
    sections: {
        myTickets: {
            heading: "My tickets",
            statuses: {
                todo: [{ key: "PROJ-42", summary: "Board summary", assignee: "me" }],
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

const tempDirs: string[] = [];

afterEach(async () => {
    const { rm } = await import("fs/promises");
    await Promise.all(tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

async function makeRepo(): Promise<string> {
    const dir = await mkdtemp(path.join(os.tmpdir(), "ib-jira-"));
    tempDirs.push(dir);
    return dir;
}

describe("resolveJiraSummary", () => {
    it("prefers the synced board summary", async () => {
        const repoRoot = await makeRepo();
        await expect(resolveJiraSummary(repoRoot, "PROJ-42", sampleBoard, "PR fallback")).resolves.toBe(
            "Board summary"
        );
    });

    it("reads local jira markdown when the board has no ticket", async () => {
        const repoRoot = await makeRepo();
        const ticketDir = path.join(repoRoot, "jira", "story");
        await mkdir(ticketDir, { recursive: true });
        await writeFile(
            path.join(ticketDir, "PROJ-99-local.md"),
            `---
title: Local summary
url: https://example.atlassian.net/browse/PROJ-99
---
`,
            "utf8"
        );

        await expect(resolveJiraSummary(repoRoot, "PROJ-99", sampleBoard, "PR fallback")).resolves.toBe(
            "Local summary"
        );
    });
});
