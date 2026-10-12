import { beforeEach, describe, expect, it, vi } from "vite-plus/test";
import { TabInputCustom, TabInputText, Uri, window } from "vscode";
import { MARKDOWN_INLINE_VIEW_TYPE } from "./MarkdownInlineProvider";
import { getActiveMarkdownUri, isMarkdownUri } from "./getActiveMarkdownUri";

const setActiveTab = (activeTab: { input: unknown } | undefined): void => {
    (window.tabGroups as unknown as { activeTabGroup: unknown }).activeTabGroup = { activeTab };
};

describe("markdownInline/host/getActiveMarkdownUri", () => {
    beforeEach(() => {
        vi.mocked(window).activeTextEditor = undefined;
        setActiveTab(undefined);
    });

    describe("isMarkdownUri", () => {
        it("matches .md case-insensitively", () => {
            expect(isMarkdownUri(Uri.file("/proj/readme.MD"))).toBe(true);
            expect(isMarkdownUri(Uri.file("/proj/readme.md"))).toBe(true);
            expect(isMarkdownUri(Uri.file("/proj/readme.mmd"))).toBe(false);
        });
    });

    describe("getActiveMarkdownUri", () => {
        it("returns the URI from the inline markdown custom editor tab", () => {
            const uri = Uri.file("/proj/readme.md");
            setActiveTab({ input: new TabInputCustom(uri, MARKDOWN_INLINE_VIEW_TYPE) });

            expect(getActiveMarkdownUri()?.toString()).toBe(uri.toString());
        });

        it("returns the URI from a text tab when the file is markdown", () => {
            const uri = Uri.file("/proj/readme.md");
            setActiveTab({ input: new TabInputText(uri) });

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
