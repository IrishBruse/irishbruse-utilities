import { describe, expect, it, vi } from "vitest";
import { Uri, workspace } from "vscode";
import { formatSelectionBlock, relativeWorkspacePath } from "./formatEditorContext";

describe("formatSelectionBlock", () => {
    it("formats a multi-line selection as a fenced code block", () => {
        const document = {
            uri: Uri.file("/repo/src/foo.ts"),
            getText: () => "line one\nline two",
        };
        const selection = {
            isEmpty: false,
            start: { line: 11, character: 0 },
            end: { line: 12, character: 8 },
        };

        expect(formatSelectionBlock("src/foo.ts", document, selection)).toBe(
            "```src/foo.ts:12-13\nline one\nline two\n```"
        );
    });

    it("returns an empty string for an empty selection", () => {
        const document = {
            uri: Uri.file("/repo/src/foo.ts"),
            getText: () => "",
        };
        const selection = {
            isEmpty: true,
            start: { line: 4, character: 2 },
            end: { line: 4, character: 2 },
        };

        expect(formatSelectionBlock("src/foo.ts", document, selection)).toBe("");
    });
});

describe("relativeWorkspacePath", () => {
    it("uses workspace.asRelativePath when a workspace folder is provided", () => {
        const uri = Uri.file("/repo/src/foo.ts");
        const workspaceFolder = { uri: Uri.file("/repo"), name: "repo", index: 0 };
        vi.spyOn(workspace, "asRelativePath").mockReturnValue("src/foo.ts");

        expect(relativeWorkspacePath(uri, workspaceFolder)).toBe("src/foo.ts");
    });

    it("falls back to the absolute path when no workspace folder is provided", () => {
        const uri = Uri.file("/repo/src/foo.ts");

        expect(relativeWorkspacePath(uri)).toBe("/repo/src/foo.ts");
    });
});
