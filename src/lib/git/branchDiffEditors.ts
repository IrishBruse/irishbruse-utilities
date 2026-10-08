import path from "path";
import { TextEditor, Uri, window } from "vscode";
import { parseGitDocumentUri } from "./gitDocument";

export function isBaseGitEditorForFile(uri: Uri, filePath: string, mergeBaseRef: string): boolean {
    if (uri.scheme !== "git") {
        return false;
    }
    const parsed = parseGitDocumentUri(uri);
    if (!parsed) {
        return false;
    }
    const sameFile = path.normalize(parsed.filePath) === path.normalize(filePath);
    const sameRef =
        parsed.ref === mergeBaseRef || parsed.ref.startsWith(mergeBaseRef.slice(0, 7));
    return sameFile && sameRef;
}

export function findBaseGitEditor(filePath: string, mergeBaseRef: string): TextEditor | undefined {
    const normalizedPath = path.normalize(filePath);
    return window.visibleTextEditors.find((editor) =>
        isBaseGitEditorForFile(editor.document.uri, normalizedPath, mergeBaseRef)
    );
}
