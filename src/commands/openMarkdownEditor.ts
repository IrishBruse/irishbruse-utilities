import { commands, window } from "vscode";
import { getActiveMarkdownUri } from "../markdownEditor/host/getActiveMarkdownUri";
import { MARKDOWN_EDITOR_VIEW_TYPE } from "../markdownEditor/host/MarkdownEditorProvider";

export async function openMarkdownEditor(): Promise<void> {
    const uri = getActiveMarkdownUri();
    if (!uri) {
        return;
    }

    const activeTab = window.tabGroups.activeTabGroup.activeTab;
    await commands.executeCommand("vscode.openWith", uri, MARKDOWN_EDITOR_VIEW_TYPE, {
        viewColumn: activeTab?.group.viewColumn,
    });
}
