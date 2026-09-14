import { commands, window } from "vscode";
import { getActiveMarkdownUri } from "../markdownEditor/host/getActiveMarkdownUri";

export async function openMarkdownSource(): Promise<void> {
    const uri = getActiveMarkdownUri();
    if (!uri) {
        return;
    }

    const activeTab = window.tabGroups.activeTabGroup.activeTab;
    await commands.executeCommand("vscode.openWith", uri, "default", {
        viewColumn: activeTab?.group.viewColumn,
    });
}
