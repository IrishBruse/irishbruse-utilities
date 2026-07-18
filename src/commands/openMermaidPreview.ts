import { commands, window } from "vscode";
import { getActiveMermaidUri } from "../mermaidEditor/getActiveMermaidUri";
import { MERMAID_PREVIEW_VIEW_TYPE } from "../mermaidEditor/MermaidCustomEditorProvider";

export async function openMermaidPreview(): Promise<void> {
    const uri = getActiveMermaidUri();
    if (!uri) {
        return;
    }

    const activeTab = window.tabGroups.activeTabGroup.activeTab;
    await commands.executeCommand("vscode.openWith", uri, MERMAID_PREVIEW_VIEW_TYPE, {
        viewColumn: activeTab?.group.viewColumn,
    });
}
