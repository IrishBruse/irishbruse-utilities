import { TabInputCustom, TabInputText, Uri, window } from "vscode";
import { MERMAID_PREVIEW_VIEW_TYPE } from "./MermaidCustomEditorProvider";

const MERMAID_EXTENSIONS = [".mmd", ".mermaid"];

export function isMermaidUri(uri: Uri): boolean {
    const path = uri.path.toLowerCase();
    return MERMAID_EXTENSIONS.some((ext) => path.endsWith(ext));
}

export function getActiveMermaidUri(): Uri | undefined {
    const activeTab = window.tabGroups.activeTabGroup.activeTab;
    const input = activeTab?.input;

    if (input instanceof TabInputCustom && input.viewType === MERMAID_PREVIEW_VIEW_TYPE) {
        return input.uri;
    }

    if (input instanceof TabInputText && isMermaidUri(input.uri)) {
        return input.uri;
    }

    const editor = window.activeTextEditor;
    if (editor && isMermaidUri(editor.document.uri)) {
        return editor.document.uri;
    }

    return undefined;
}
