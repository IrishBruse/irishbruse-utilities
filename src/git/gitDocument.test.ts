import { beforeEach, describe, expect, it } from "vitest";
import { Uri } from "vscode";
import { clearBranchDiffSession, setBranchDiffSession } from "./branchDiffFiles";
import {
    noteMatchesGitUri,
    parseGitDocumentUri,
    repoRelativePath,
    repoRootForDocumentUri,
    sideFromGitRef,
    uriForNote,
} from "./gitDocument";
import type { ReviewNote } from "./reviewNotes";

const repoRoot = "/home/user/project";
const filePath = "/home/user/project/src/a.ts";

function gitUri(ref: string): Uri {
    return Uri.from({
        scheme: "git",
        path: filePath,
        query: JSON.stringify({ path: filePath, ref }),
    });
}

describe("parseGitDocumentUri", () => {
    it("parses git scheme URIs", () => {
        const parsed = parseGitDocumentUri(gitUri("HEAD"));
        expect(parsed).toEqual({ filePath, ref: "HEAD" });
    });

    it("returns undefined for non-git URIs", () => {
        expect(parseGitDocumentUri(Uri.file(filePath))).toBeUndefined();
    });
});

describe("repoRelativePath", () => {
    it("returns repo-relative path from git URI", () => {
        expect(repoRelativePath(gitUri("HEAD"), repoRoot)).toBe("src/a.ts");
    });

    it("returns repo-relative path from file URI", () => {
        expect(repoRelativePath(Uri.file(filePath), repoRoot)).toBe("src/a.ts");
    });
});

describe("repoRootForDocumentUri", () => {
    beforeEach(() => {
        clearBranchDiffSession();
    });

    it("resolves repo root from git URI via active repo fallback", () => {
        expect(repoRootForDocumentUri(gitUri("HEAD"), repoRoot)).toBe(repoRoot);
    });

    it("resolves repo root from branch diff working tree file", () => {
        setBranchDiffSession(repoRoot, "abc123", [filePath]);
        expect(repoRootForDocumentUri(Uri.file(filePath))).toBe(repoRoot);
    });

    it("falls back to active repo root for unknown URIs", () => {
        expect(repoRootForDocumentUri(Uri.file("/elsewhere/a.ts"), "/fallback")).toBe("/fallback");
    });
});

describe("sideFromGitRef", () => {
    const mergeBase = "abc123def456";

    it("maps HEAD to RIGHT", () => {
        expect(sideFromGitRef("HEAD", mergeBase)).toBe("RIGHT");
    });

    it("maps merge base to LEFT", () => {
        expect(sideFromGitRef(mergeBase, mergeBase)).toBe("LEFT");
    });

    it("maps merge base prefix to LEFT", () => {
        expect(sideFromGitRef("abc123d", mergeBase)).toBe("LEFT");
    });
});

describe("uriForNote", () => {
    const note: ReviewNote = {
        id: "1",
        file: "src/a.ts",
        line: 5,
        side: "RIGHT",
        body: "test",
        createdAt: "2026-01-01T00:00:00Z",
    };

    it("uses HEAD ref for RIGHT side notes", () => {
        const uri = uriForNote(repoRoot, note, { headRef: "HEAD", mergeBaseRef: "abc123" });
        const parsed = parseGitDocumentUri(uri);
        expect(parsed?.ref).toBe("HEAD");
    });

    it("uses merge base ref for LEFT side notes", () => {
        const leftNote = { ...note, side: "LEFT" as const };
        const uri = uriForNote(repoRoot, leftNote, { headRef: "HEAD", mergeBaseRef: "abc123" });
        const parsed = parseGitDocumentUri(uri);
        expect(parsed?.ref).toBe("abc123");
    });
});

describe("noteMatchesGitUri", () => {
    const note: ReviewNote = {
        id: "1",
        file: "src/a.ts",
        line: 5,
        side: "RIGHT",
        body: "test",
        createdAt: "2026-01-01T00:00:00Z",
    };

    it("matches git URI with same file and side", () => {
        expect(noteMatchesGitUri(note, gitUri("HEAD"), repoRoot, "abc123")).toBe(true);
    });

    it("does not match different side", () => {
        expect(noteMatchesGitUri(note, gitUri("abc123"), repoRoot, "abc123")).toBe(false);
    });

    it("matches working tree file URI for RIGHT side notes", () => {
        expect(noteMatchesGitUri(note, Uri.file(filePath), repoRoot, "abc123")).toBe(true);
    });
});
