import type { Selection, TextDocument, Uri, WorkspaceFolder } from "vscode";
import { workspace } from "vscode";

export function relativeWorkspacePath(uri: Uri, workspaceFolder?: WorkspaceFolder): string {
    if (workspaceFolder) {
        return workspace.asRelativePath(uri, false).replace(/\\/g, "/");
    }
    return uri.fsPath.replace(/\\/g, "/");
}

export function formatSelectionBlock(relativePath: string, document: TextDocument, selection: Selection): string {
    if (selection.isEmpty) {
        return "";
    }

    const startLine = selection.start.line + 1;
    const endLine = selection.end.line + 1;
    const text = document.getText(selection);
    return `\`\`\`${relativePath}:${startLine}-${endLine}\n${text}\n\`\`\``;
}
