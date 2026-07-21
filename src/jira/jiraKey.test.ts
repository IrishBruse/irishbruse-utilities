import { describe, expect, it } from "vitest";
import {
    extractJiraKeyFromBranch,
    extractJiraKeyFromTitle,
    resolveJiraKey,
    summaryFromPrTitle,
} from "./jiraKey";

const keyPattern = /[A-Z][A-Z0-9]+-\d+/;

describe("extractJiraKeyFromTitle", () => {
    it("reads a key from the start of the PR title", () => {
        expect(extractJiraKeyFromTitle("PROJ-123 Add Jira row", keyPattern)).toBe("PROJ-123");
    });

    it("ignores keys that are not at the start of the title", () => {
        expect(extractJiraKeyFromTitle("Add PROJ-123 row", keyPattern)).toBeUndefined();
    });
});

describe("extractJiraKeyFromBranch", () => {
    it("reads a key from a feature branch", () => {
        expect(extractJiraKeyFromBranch("feature/PROJ-123-add-jira-row", keyPattern)).toBe("PROJ-123");
    });

    it("reads a key from a slash-delimited branch", () => {
        expect(extractJiraKeyFromBranch("PROJ-456/fix", keyPattern)).toBe("PROJ-456");
    });
});

describe("resolveJiraKey", () => {
    it("prefers the PR title over the branch name", () => {
        expect(
            resolveJiraKey("TEAM-9 Title key", "feature/PROJ-123-branch", keyPattern)
        ).toEqual({
            key: "TEAM-9",
            source: "title",
        });
    });

    it("falls back to the branch when the title has no key", () => {
        expect(resolveJiraKey("Untitled change", "feature/PROJ-123-branch", keyPattern)).toEqual({
            key: "PROJ-123",
            source: "branch",
        });
    });
});

describe("summaryFromPrTitle", () => {
    it("returns the remainder of the title after the key", () => {
        expect(summaryFromPrTitle("PROJ-123 — Short summary", "PROJ-123")).toBe("Short summary");
    });

    it("returns the title unchanged when the key is not prefixed", () => {
        expect(summaryFromPrTitle("Add Jira row", "PROJ-123")).toBe("Add Jira row");
    });

    it("truncates long summaries", () => {
        const longSummary = "x".repeat(90);
        expect(summaryFromPrTitle(`PROJ-123 ${longSummary}`, "PROJ-123")?.length).toBe(80);
    });
});
