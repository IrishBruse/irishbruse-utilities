import { TabInputCustom, TabInputText, Uri, window } from "vscode";
import { MARKDOWN_EDITOR_VIEW_TYPE } from "./MarkdownEditorProvider";

export function isMarkdownUri(uri: Uri): boolean {
    return uri.path.toLowerCase().endsWith(".md");
}

export function getActiveMarkdownUri(): Uri | undefined {
    const activeTab = window.tabGroups.activeTabGroup.activeTab;
    const input = activeTab?.input;

    if (input instanceof TabInputCustom && input.viewType === MARKDOWN_EDITOR_VIEW_TYPE) {
        return input.uri;
    }

    if (input instanceof TabInputText && isMarkdownUri(input.uri)) {
        return input.uri;
    }

    const editor = window.activeTextEditor;
    if (editor && isMarkdownUri(editor.document.uri)) {
        return editor.document.uri;
    }

    return undefined;
}
