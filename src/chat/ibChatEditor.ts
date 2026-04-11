import { ExtensionContext, ViewColumn, WebviewPanel, window } from "vscode";
import { buildIbChatHtml } from "./ibChatHtml";

const editorViewType = "ibUtilitiesIbChatEditor";

const panelsBySessionId = new Map<string, WebviewPanel>();

/**
 * Reveals an existing editor webview for the session or creates one with the given title.
 */
export function openOrRevealIbChatEditor(context: ExtensionContext, sessionId: string, title: string): void {
    const existing = panelsBySessionId.get(sessionId);
    if (existing) {
        existing.reveal(ViewColumn.Active);
        return;
    }
    const panel = window.createWebviewPanel(editorViewType, title, ViewColumn.Active, {
        enableScripts: false,
        retainContextWhenHidden: true,
        localResourceRoots: [context.extensionUri],
    });
    panel.webview.html = buildIbChatHtml(panel.webview.cspSource, `session-${sessionId}`);
    panel.onDidDispose(() => {
        panelsBySessionId.delete(sessionId);
    });
    panelsBySessionId.set(sessionId, panel);
    context.subscriptions.push(panel);
}

/**
 * Closes the editor webview for a session if it is open.
 */
export function disposeIbChatEditorForSession(sessionId: string): void {
    const panel = panelsBySessionId.get(sessionId);
    if (panel) {
        panel.dispose();
    }
}

/**
 * Creates a new session row and opens its editor tab (used by the standalone New in Editor command).
 */
export function openNewIbChatEditor(context: ExtensionContext, sessionId: string, title: string): void {
    openOrRevealIbChatEditor(context, sessionId, title);
}
