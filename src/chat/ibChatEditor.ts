import { ExtensionContext, ViewColumn, window } from "vscode";
import { buildIbChatHtml } from "./ibChatHtml";

const editorViewType = "ibUtilitiesIbChatEditor";

let editorSerial = 0;

/**
 * Opens a new chat webview in the editor area, like adding another terminal in the editor group.
 */
export function openNewIbChatEditor(context: ExtensionContext): void {
    editorSerial += 1;
    const title = editorSerial === 1 ? "IB Chat" : `IB Chat (${editorSerial})`;
    const panel = window.createWebviewPanel(editorViewType, title, ViewColumn.Active, {
        enableScripts: false,
        retainContextWhenHidden: true,
        localResourceRoots: [context.extensionUri],
    });
    panel.webview.html = buildIbChatHtml(panel.webview.cspSource, `editor-${editorSerial}`);
    context.subscriptions.push(panel);
}
