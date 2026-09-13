import { beforeEach, describe, expect, it, vi } from "vitest";
import { TabInputCustom, TabInputText, Uri, window } from "vscode";
import { getActiveFileUri } from "./getActiveFileUri";

describe("diskConflict/getActiveFileUri", () => {
    beforeEach(() => {
        vi.mocked(window).activeTextEditor = undefined;
        vi.mocked(window.tabGroups).activeTabGroup = {
            activeTab: undefined,
        } as typeof window.tabGroups.activeTabGroup;
    });

    it("returns the URI from a custom editor tab", () => {
        const uri = Uri.file("/proj/readme.md");
        const input = Object.assign(new TabInputCustom(), { viewType: "ib-utilities.markdownEditor", uri });
        vi.mocked(window.tabGroups).activeTabGroup = {
            activeTab: { input },
        } as typeof window.tabGroups.activeTabGroup;

        expect(getActiveFileUri()?.fsPath).toBe(uri.fsPath);
    });

    it("returns the URI from a text tab", () => {
        const uri = Uri.file("/proj/foo.ts");
        const input = Object.assign(new TabInputText(), { uri });
        vi.mocked(window.tabGroups).activeTabGroup = {
            activeTab: { input },
        } as typeof window.tabGroups.activeTabGroup;

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
        const input = Object.assign(new TabInputText(), { uri });
        vi.mocked(window.tabGroups).activeTabGroup = {
            activeTab: { input },
        } as typeof window.tabGroups.activeTabGroup;

        expect(getActiveFileUri()).toBeUndefined();
    });
});
