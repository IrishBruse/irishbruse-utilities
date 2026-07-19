import { describe, expect, it } from "vitest";
import { findNoteAtLocation, formatReviewSummary, type ReviewNotesFile } from "./reviewNotes";

describe("formatReviewSummary", () => {
    it("groups notes by file", () => {
        const data: ReviewNotesFile = {
            branch: "feature/x",
            baseBranch: "main",
            notes: [
                {
                    id: "1",
                    file: "src/a.ts",
                    line: 10,
                    side: "RIGHT",
                    body: "Needed for API compat",
                    createdAt: "2026-01-01T00:00:00Z",
                },
                {
                    id: "2",
                    file: "src/a.ts",
                    line: 20,
                    side: "RIGHT",
                    body: "Follow-up cleanup",
                    createdAt: "2026-01-01T00:00:00Z",
                    published: true,
                },
            ],
        };

        const summary = formatReviewSummary(data);
        expect(summary).toContain("src/a.ts");
        expect(summary).toContain("Needed for API compat");
        expect(summary).not.toContain("Follow-up cleanup");
    });
});

describe("findNoteAtLocation", () => {
    const data: ReviewNotesFile = {
        branch: "feature/x",
        baseBranch: "main",
        notes: [
            {
                id: "1",
                file: "src/a.ts",
                line: 10,
                side: "RIGHT",
                body: "Note",
                createdAt: "2026-01-01T00:00:00Z",
            },
        ],
    };

    it("finds a note at the same file, line, and side", () => {
        expect(findNoteAtLocation(data, "src/a.ts", 10, "RIGHT")?.id).toBe("1");
    });

    it("returns undefined when no note matches", () => {
        expect(findNoteAtLocation(data, "src/a.ts", 11, "RIGHT")).toBeUndefined();
        expect(findNoteAtLocation(data, "src/a.ts", 10, "LEFT")).toBeUndefined();
    });
});
