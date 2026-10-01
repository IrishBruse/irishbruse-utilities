import { beforeEach, describe, expect, it, vi } from "vitest";
import { commands, Uri, window, workspace } from "vscode";
import {
    isDirectMarkdownEditUri,
    openMarkdownWithRawEditor,
    shouldUseMarkdownCustomEditor,
} from "./shouldUseMarkdownCustomEditor";

describe("shouldUseMarkdownCustomEditor", () => {
    beforeEach(() => {
        vi.mocked(window.tabGroups).all = [];
        workspace.textDocuments = [];
        vi.mocked(commands.executeCommand).mockClear();
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

    it("rejects a file URI opened in a merge editor", () => {
        const result = Uri.file("/proj/readme.md");
        vi.mocked(window.tabGroups).all = [
            {
                tabs: [{
                    input: {
                        base: Uri.from({ scheme: "git", path: "/proj/readme.md" }),
                        input1: Uri.from({ scheme: "git", path: "/proj/readme.md", query: "ours" }),
                        input2: Uri.from({ scheme: "git", path: "/proj/readme.md", query: "theirs" }),
                        result,
                    },
                }],
            },
        ] as typeof window.tabGroups.all;

        expect(shouldUseMarkdownCustomEditor(result)).toBe(false);
    });

    it("rejects a file URI listed in a multi-diff tab", () => {
        const modified = Uri.file("/proj/readme.md");
        vi.mocked(window.tabGroups).all = [
            {
                tabs: [{
                    input: {
                        textDiffs: [{
                            original: Uri.from({ scheme: "git", path: "/proj/readme.md" }),
                            modified,
                        }],
                    },
                }],
            },
        ] as typeof window.tabGroups.all;

        expect(shouldUseMarkdownCustomEditor(modified)).toBe(false);
    });

    it("rejects a working tree file that is open beside a git document", () => {
        const modified = Uri.file("/proj/readme.md");
        workspace.textDocuments = [
            { uri: modified },
            { uri: Uri.from({ scheme: "git", path: "/proj/readme.md", query: "{\"path\":\"/proj/readme.md\",\"ref\":\"~\"}" }) },
        ] as typeof workspace.textDocuments;

        expect(shouldUseMarkdownCustomEditor(modified)).toBe(false);
        expect(shouldUseMarkdownCustomEditor(Uri.file("/proj/other.md"))).toBe(true);
    });

    it("reopens a git working tree file as a text diff", async () => {
        const modified = Uri.file("/proj/readme.md");
        const original = Uri.from({ scheme: "git", path: "/proj/readme.md" });
        workspace.textDocuments = [
            { uri: modified },
            { uri: original },
        ] as typeof workspace.textDocuments;

        await openMarkdownWithRawEditor(modified);

        expect(commands.executeCommand).toHaveBeenCalledWith(
            "_workbench.diff",
            original,
            modified,
            undefined,
            undefined,
            { editorOptions: { override: "default" } },
        );
    });
});
