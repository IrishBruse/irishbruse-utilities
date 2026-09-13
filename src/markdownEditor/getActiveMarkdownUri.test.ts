import { beforeEach, describe, expect, it, vi } from "vitest";
import { TabInputCustom, TabInputText, Uri, window } from "vscode";
import { MARKDOWN_EDITOR_VIEW_TYPE } from "./MarkdownEditorProvider";
import { getActiveMarkdownUri, isMarkdownUri } from "./getActiveMarkdownUri";

describe("markdownEditor/getActiveMarkdownUri", () => {
    beforeEach(() => {
        vi.mocked(window).activeTextEditor = undefined;
        vi.mocked(window.tabGroups).activeTabGroup = {
            activeTab: undefined,
        } as typeof window.tabGroups.activeTabGroup;
    });

    describe("isMarkdownUri", () => {
        it("matches .md case-insensitively", () => {
            expect(isMarkdownUri(Uri.file("/proj/readme.MD"))).toBe(true);
            expect(isMarkdownUri(Uri.file("/proj/readme.md"))).toBe(true);
            expect(isMarkdownUri(Uri.file("/proj/readme.mmd"))).toBe(false);
        });
    });

    describe("getActiveMarkdownUri", () => {
        it("returns the URI from the markdown editor custom editor tab", () => {
            const uri = Uri.file("/proj/readme.md");
            const input = Object.assign(new TabInputCustom(), { viewType: MARKDOWN_EDITOR_VIEW_TYPE, uri });
            vi.mocked(window.tabGroups).activeTabGroup = {
                activeTab: { input },
            } as typeof window.tabGroups.activeTabGroup;

            expect(getActiveMarkdownUri()?.toString()).toBe(uri.toString());
        });

        it("returns the URI from a text tab when the file is markdown", () => {
            const uri = Uri.file("/proj/readme.md");
            const input = Object.assign(new TabInputText(), { uri });
            vi.mocked(window.tabGroups).activeTabGroup = {
                activeTab: { input },
            } as typeof window.tabGroups.activeTabGroup;

            expect(getActiveMarkdownUri()?.fsPath).toBe(uri.fsPath);
        });

        it("falls back to the active text editor", () => {
            const uri = Uri.file("/proj/notes.md");
            vi.mocked(window).activeTextEditor = {
                document: { uri },
            } as typeof window.activeTextEditor;

            expect(getActiveMarkdownUri()?.fsPath).toBe(uri.fsPath);
        });

        it("returns undefined when no markdown resource is active", () => {
            vi.mocked(window).activeTextEditor = {
                document: { uri: Uri.file("/proj/foo.ts") },
            } as typeof window.activeTextEditor;

            expect(getActiveMarkdownUri()).toBeUndefined();
        });
    });
});
