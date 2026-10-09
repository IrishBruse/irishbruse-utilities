import { commands, window } from "vscode";
import { getActiveMarkdownUri } from "../markdownInlineHost/getActiveMarkdownUri";
import { MARKDOWN_INLINE_VIEW_TYPE } from "../markdownInlineHost/MarkdownInlineProvider";
import { shouldUseMarkdownCustomEditor } from "../markdownInlineHost/shouldUseMarkdownCustomEditor";

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
