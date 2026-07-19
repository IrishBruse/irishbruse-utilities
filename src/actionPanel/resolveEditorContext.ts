import { window, workspace } from "vscode";
import { formatSelectionBlock, relativeWorkspacePath } from "./formatEditorContext";

export type EditorContext = {
    file: string;
    selection: string;
};

export function resolveEditorContext(): EditorContext {
    const editor = window.activeTextEditor;
    if (!editor || editor.document.uri.scheme !== "file") {
        return { file: "", selection: "" };
    }

    const workspaceFolder = workspace.getWorkspaceFolder(editor.document.uri);
    const file = relativeWorkspacePath(editor.document.uri, workspaceFolder);
    const selection = formatSelectionBlock(file, editor.document, editor.selection);
    return { file, selection };
}
