import { TabInputCustom, TabInputText, Uri, window } from "vscode";

function fileUri(uri: Uri | undefined): Uri | undefined {
    if (!uri || uri.scheme !== "file") {
        return undefined;
    }
    return uri;
}

export function getActiveFileUri(): Uri | undefined {
    const activeTab = window.tabGroups.activeTabGroup.activeTab;
    const input = activeTab?.input;

    if (input instanceof TabInputCustom) {
        return fileUri(input.uri);
    }

    if (input instanceof TabInputText) {
        return fileUri(input.uri);
    }

    const editor = window.activeTextEditor;
    if (editor) {
        return fileUri(editor.document.uri);
    }

    return undefined;
}
