import { beforeEach, describe, expect, it, vi } from "vite-plus/test";
import { TabInputCustom, TabInputText, Uri, window } from "vscode";
import { getActiveFileUri } from "./getActiveFileUri";

const setActiveTab = (activeTab: { input: unknown } | undefined): void => {
    (window.tabGroups as unknown as { activeTabGroup: unknown }).activeTabGroup = { activeTab };
};

describe("diskConflict/getActiveFileUri", () => {
    beforeEach(() => {
        vi.mocked(window).activeTextEditor = undefined;
        setActiveTab(undefined);
    });

    it("returns the URI from a custom editor tab", () => {
        const uri = Uri.file("/proj/readme.md");
        setActiveTab({ input: new TabInputCustom(uri, "ib-utilities.markdownInline") });

        expect(getActiveFileUri()?.fsPath).toBe(uri.fsPath);
    });

    it("returns the URI from a text tab", () => {
        const uri = Uri.file("/proj/foo.ts");
        setActiveTab({ input: new TabInputText(uri) });

        expect(getActiveFileUri()?.fsPath).toBe(uri.fsPath);
    });

    it("falls back to the active text editor", () => {
        const uri = Uri.file("/proj/foo.ts");
        vi.mocked(window).activeTextEditor = {
            document: { uri },
        } as typeof window.activeTextEditor;

        expect(getActiveFileUri()?.fsPath).toBe(uri.fsPath);
    });

    it("returns undefined for untitled editors", () => {
        const uri = Uri.from({ scheme: "untitled", path: "Untitled-1" });
        setActiveTab({ input: new TabInputText(uri) });

        expect(getActiveFileUri()).toBeUndefined();
    });
});
