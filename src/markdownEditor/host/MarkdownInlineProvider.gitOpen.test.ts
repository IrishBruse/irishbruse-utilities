import { beforeEach, describe, expect, it, vi } from "vitest";
import { commands, Uri, window, workspace, type ExtensionContext, type TextDocument, type WebviewPanel } from "vscode";
import { MarkdownInlineProvider } from "./MarkdownInlineProvider";

describe("MarkdownInlineProvider git open", () => {
    beforeEach(() => {
        vi.mocked(window.tabGroups).all = [];
        workspace.textDocuments = [];
        vi.mocked(commands.executeCommand).mockClear();
    });

    it("reopens a git panel working tree file as a text diff and does not render", async () => {
        const modified = Uri.file("/proj/readme.md");
        const original = Uri.from({ scheme: "git", path: "/proj/readme.md" });
        workspace.textDocuments = [
            { uri: modified },
            { uri: original },
        ] as typeof workspace.textDocuments;
        vi.mocked(window.tabGroups).all = [
            { tabs: [{ input: undefined }] },
        ] as typeof window.tabGroups.all;

        const html: string[] = [];
        const panel = {
            viewColumn: 1,
            dispose: vi.fn(),
            webview: {
                set html(value: string) {
                    html.push(value);
                },
            },
        };

        await new MarkdownInlineProvider({} as ExtensionContext).resolveCustomTextEditor(
            { uri: modified } as TextDocument,
            panel as unknown as WebviewPanel,
            { isCancellationRequested: false, onCancellationRequested: vi.fn() },
        );

        expect(html).toEqual([]);
        expect(panel.dispose).toHaveBeenCalledOnce();
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
