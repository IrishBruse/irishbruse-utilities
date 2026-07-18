import { describe, expect, it } from "vitest";
import { formatReviewSummary, type ReviewNotesFile } from "./reviewNotes";

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
