import { commands, window } from "vscode";
import { getActiveMermaidUri } from "../mermaidEditor/getActiveMermaidUri";

export async function openMermaidSource(): Promise<void> {
    const uri = getActiveMermaidUri();
    if (!uri) {
        return;
    }

    const activeTab = window.tabGroups.activeTabGroup.activeTab;
    await commands.executeCommand("vscode.openWith", uri, "default", {
        viewColumn: activeTab?.group.viewColumn,
    });
}
