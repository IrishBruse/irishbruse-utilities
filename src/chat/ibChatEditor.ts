import { ExtensionContext, ViewColumn, WebviewPanel, window, workspace } from "vscode";
import { getIbChatWebviewHtml } from "./ibChatWebviewShell";
import { tryParseWebviewMessage } from "./protocol/ibChatProtocol";
import type { ExtensionToWebviewMessage } from "./protocol/ibChatProtocol";

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
        enableScripts: true,
        retainContextWhenHidden: true,
        localResourceRoots: [context.extensionUri],
    });
    panel.webview.html = getIbChatWebviewHtml(context.extensionUri, panel.webview);
    panel.webview.onDidReceiveMessage((message: unknown) => {
        const parsed = tryParseWebviewMessage(message);
        if (!parsed) {
            return;
        }
        if (parsed.type === "ready") {
            const pkg = context.extension.packageJSON as { version?: string };
            const versionRaw = pkg.version;
            const agentVersionLabel =
                typeof versionRaw === "string" && versionRaw.length > 0 ? `v${versionRaw}` : undefined;
            const folder = workspace.workspaceFolders?.[0];
            const workspaceLabel = folder !== undefined ? folder.uri.fsPath : undefined;
            const outgoing: ExtensionToWebviewMessage = {
                type: "init",
                sessionId,
                title,
                workspaceLabel,
                agentVersionLabel,
            };
            void panel.webview.postMessage(outgoing);
        }
    });
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
