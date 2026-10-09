import { commands, window } from "vscode";
import {
    getActiveMarkdownUri,
    MARKDOWN_INLINE_VIEW_TYPE,
    shouldUseMarkdownCustomEditor,
} from "../markdownInlineHost";

export async function openMarkdownInline(): Promise<void> {
    const uri = getActiveMarkdownUri();
    if (!uri || !shouldUseMarkdownCustomEditor(uri)) {
        return;
    }

    const activeTab = window.tabGroups.activeTabGroup.activeTab;
    await commands.executeCommand("vscode.openWith", uri, MARKDOWN_INLINE_VIEW_TYPE, {
        viewColumn: activeTab?.group.viewColumn,
    });
}
