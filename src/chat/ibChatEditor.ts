import { ExtensionContext, ViewColumn, WebviewPanel, window, workspace } from "vscode";
import { getIbChatWebviewHtml } from "./ibChatWebviewShell";
import { tryParseWebviewMessage } from "./protocol/ibChatProtocol";
import type { ExtensionToWebviewMessage } from "./protocol/ibChatProtocol";
import { AcpSessionBridge } from "./acp/acpSessionBridge";
import { getAcpAgentConfigs, type AcpAgentConfig } from "./acp/acpAgentConfig";

const editorViewType = "ibUtilitiesIbChatEditor";

const panelsBySessionId = new Map<string, WebviewPanel>();
const bridgesBySessionId = new Map<string, AcpSessionBridge>();

/**
 * Reveals an existing editor webview for the session or creates one with the given title.
 */
export function openOrRevealIbChatEditor(
    context: ExtensionContext,
    sessionId: string,
    title: string,
    agentConfig?: AcpAgentConfig
): void {
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

    const post = (msg: ExtensionToWebviewMessage): void => {
        void panel.webview.postMessage(msg);
    };

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
            post({
                type: "init",
                sessionId,
                title,
                workspaceLabel,
                agentVersionLabel,
                acpAgentName: agentConfig?.name,
            });
        }
        if (parsed.type === "send") {
            void handleSend(sessionId, parsed.body, post, agentConfig);
        }
        if (parsed.type === "cancel") {
            void handleCancel(sessionId);
        }
    });
    panel.onDidDispose(() => {
        panelsBySessionId.delete(sessionId);
        const bridge = bridgesBySessionId.get(sessionId);
        if (bridge) {
            bridge.dispose();
            bridgesBySessionId.delete(sessionId);
        }
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
export function openNewIbChatEditor(
    context: ExtensionContext,
    sessionId: string,
    title: string,
    agentConfig?: AcpAgentConfig
): void {
    openOrRevealIbChatEditor(context, sessionId, title, agentConfig);
}

async function handleSend(
    sessionId: string,
    body: string,
    post: (msg: ExtensionToWebviewMessage) => void,
    agentConfig?: AcpAgentConfig
): Promise<void> {
    let bridge = bridgesBySessionId.get(sessionId);

    if (!bridge) {
        const config = agentConfig ?? pickAgentConfig();
        if (!config) {
            post({ type: "error", message: "No ACP agents configured. Add agents in settings (ib-utilities.acpAgents)." });
            return;
        }
        bridge = new AcpSessionBridge(config, post);
        bridgesBySessionId.set(sessionId, bridge);
        try {
            await bridge.connect();
        } catch (err: unknown) {
            const message = err instanceof Error ? err.message : String(err);
            post({ type: "error", message: `Failed to connect to agent: ${message}` });
            bridge.dispose();
            bridgesBySessionId.delete(sessionId);
            return;
        }
    }

    void bridge.prompt(body);
}

async function handleCancel(sessionId: string): Promise<void> {
    const bridge = bridgesBySessionId.get(sessionId);
    if (bridge) {
        await bridge.cancel();
    }
}

function pickAgentConfig(): AcpAgentConfig | undefined {
    const configs = getAcpAgentConfigs();
    return configs[0];
}
