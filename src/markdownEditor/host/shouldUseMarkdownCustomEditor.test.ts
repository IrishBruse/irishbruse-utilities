import { beforeEach, describe, expect, it, vi } from "vitest";
import { Uri, window } from "vscode";
import {
    isDirectMarkdownEditUri,
    shouldUseMarkdownCustomEditor,
} from "./shouldUseMarkdownCustomEditor";

describe("shouldUseMarkdownCustomEditor", () => {
    beforeEach(() => {
        vi.mocked(window.tabGroups).all = [];
    });

    describe("isDirectMarkdownEditUri", () => {
        it("allows workspace and untitled documents", () => {
            expect(isDirectMarkdownEditUri(Uri.file("/proj/readme.md"))).toBe(true);
            expect(isDirectMarkdownEditUri(Uri.from({ scheme: "untitled", path: "/Untitled-1" }))).toBe(true);
            expect(isDirectMarkdownEditUri(Uri.from({ scheme: "vscode-remote", path: "/home/a.md" }))).toBe(true);
        });

        it("rejects git and history schemes used in diffs", () => {
            expect(isDirectMarkdownEditUri(Uri.from({ scheme: "git", path: "/proj/readme.md" }))).toBe(false);
            expect(isDirectMarkdownEditUri(Uri.from({ scheme: "gitlens", path: "/proj/readme.md" }))).toBe(false);
            expect(isDirectMarkdownEditUri(Uri.from({ scheme: "vscode-local-history", path: "/proj/readme.md" }))).toBe(false);
        });
    });

    it("rejects a file URI that is already open in a text diff tab", () => {
        const original = Uri.file("/proj/old.md");
        const modified = Uri.file("/proj/readme.md");
        vi.mocked(window.tabGroups).all = [
            {
                tabs: [{ input: { original, modified } }],
            },
        ] as typeof window.tabGroups.all;

        expect(shouldUseMarkdownCustomEditor(modified)).toBe(false);
        expect(shouldUseMarkdownCustomEditor(original)).toBe(false);
        expect(shouldUseMarkdownCustomEditor(Uri.file("/proj/other.md"))).toBe(true);
    });

    it("rejects a file URI opened in a multi-file compare", () => {
        const modified = Uri.file("/proj/readme.md");
        vi.mocked(window.tabGroups).all = [
            {
                tabs: [{ input: { resources: [{ original: Uri.file("/proj/old.md"), modified }] } }],
            },
        ] as typeof window.tabGroups.all;

        expect(shouldUseMarkdownCustomEditor(modified)).toBe(false);
    });
});
