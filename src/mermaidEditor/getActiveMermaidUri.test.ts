import { beforeEach, describe, expect, it, vi } from "vitest";
import { TabInputCustom, TabInputText, Uri, window } from "vscode";
import { MERMAID_PREVIEW_VIEW_TYPE } from "./MermaidCustomEditorProvider";
import { getActiveMermaidUri, isMermaidUri } from "./getActiveMermaidUri";

describe("mermaidEditor/getActiveMermaidUri", () => {
    beforeEach(() => {
        vi.mocked(window).activeTextEditor = undefined;
        vi.mocked(window.tabGroups).activeTabGroup = {
            activeTab: undefined,
        } as typeof window.tabGroups.activeTabGroup;
    });

    describe("isMermaidUri", () => {
        it("matches .mmd and .mermaid case-insensitively", () => {
            expect(isMermaidUri(Uri.file("/proj/obj/Graph.MMD"))).toBe(true);
            expect(isMermaidUri(Uri.file("/proj/diagram.Mermaid"))).toBe(true);
            expect(isMermaidUri(Uri.file("/proj/readme.md"))).toBe(false);
        });
    });

    describe("getActiveMermaidUri", () => {
        it("returns the URI from the mermaid preview custom editor tab", () => {
            const uri = Uri.file("/proj/obj/graph.mmd");
            const input = Object.assign(new TabInputCustom(), { viewType: MERMAID_PREVIEW_VIEW_TYPE, uri });
            vi.mocked(window.tabGroups).activeTabGroup = {
                activeTab: { input },
            } as typeof window.tabGroups.activeTabGroup;

            expect(getActiveMermaidUri()?.toString()).toBe(uri.toString());
        });

        it("returns the URI from a text tab when the file is mermaid", () => {
            const uri = Uri.file("/proj/graph.mmd");
            const input = Object.assign(new TabInputText(), { uri });
            vi.mocked(window.tabGroups).activeTabGroup = {
                activeTab: { input },
            } as typeof window.tabGroups.activeTabGroup;

            expect(getActiveMermaidUri()?.fsPath).toBe(uri.fsPath);
        });

        it("falls back to the active text editor", () => {
            const uri = Uri.file("/proj/a.mermaid");
            vi.mocked(window).activeTextEditor = {
                document: { uri },
            } as typeof window.activeTextEditor;

            expect(getActiveMermaidUri()?.fsPath).toBe(uri.fsPath);
        });

        it("returns undefined when no mermaid resource is active", () => {
            vi.mocked(window).activeTextEditor = {
                document: { uri: Uri.file("/proj/foo.ts") },
            } as typeof window.activeTextEditor;

            expect(getActiveMermaidUri()).toBeUndefined();
        });
    });
});
