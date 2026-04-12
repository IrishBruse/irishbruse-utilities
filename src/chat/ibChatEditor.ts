import { ExtensionContext, ViewColumn, WebviewPanel, window, workspace } from "vscode";
import { getIbChatWebviewHtml } from "./ibChatWebviewShell";
import { tryParseWebviewMessage } from "./protocol/ibChatProtocol";
import type { ExtensionToWebviewMessage } from "./protocol/ibChatProtocol";
import { AcpSessionBridge } from "./acp/acpSessionBridge";
import { getAcpAgentConfigByName, getAcpAgentConfigs, type AcpAgentConfig } from "./acp/acpAgentConfig";
import { getIbChatPromptHistoryEntries, setIbChatPromptHistoryEntries } from "./ibChatPromptHistoryMemento";
import { setIbChatSessionAgentName } from "./ibChatSessionsStore";

const editorViewType = "ibUtilitiesIbChatEditor";

const panelsBySessionId = new Map<string, WebviewPanel>();
const bridgesBySessionId = new Map<string, AcpSessionBridge>();
const pendingModelIdBySessionId = new Map<string, string>();
const agentConfigBySessionId = new Map<string, AcpAgentConfig | undefined>();

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
    agentConfigBySessionId.set(sessionId, agentConfig);
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
            const availableNames = getAcpAgentConfigs().map((c) => c.name);
            const promptHistory = getIbChatPromptHistoryEntries(context, sessionId);
            const initPayload: ExtensionToWebviewMessage = {
                type: "init",
                sessionId,
                title,
                workspaceLabel,
                agentVersionLabel,
                acpAgentName: agentConfig?.name,
                ...(availableNames.length > 0 ? { availableAcpAgents: availableNames } : {}),
                ...(promptHistory.length > 0 ? { promptHistory } : {}),
            };
            void Promise.resolve().then(() => {
                post(initPayload);
                void ensureBridgeConnected(sessionId, post);
            });
        }
        if (parsed.type === "savePromptHistory") {
            setIbChatPromptHistoryEntries(context, sessionId, parsed.entries);
        }
        if (parsed.type === "send") {
            void handleSend(sessionId, parsed.body, post);
        }
        if (parsed.type === "cancel") {
            void handleCancel(sessionId);
        }
        if (parsed.type === "setSessionModel") {
            void handleSetSessionModel(sessionId, parsed.modelId, post);
        }
        if (parsed.type === "setSessionAgent") {
            handleSetSessionAgent(sessionId, parsed.agentName, post);
        }
        if (parsed.type === "permissionResponse") {
            bridgesBySessionId.get(sessionId)?.handlePermissionResponse(parsed);
        }
    });
    panel.onDidDispose(() => {
        panelsBySessionId.delete(sessionId);
        agentConfigBySessionId.delete(sessionId);
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

/**
 * Spawns the agent if needed, runs ACP initialize and session/new, and forwards models and session updates to the webview.
 */
async function ensureBridgeConnected(
    sessionId: string,
    post: (msg: ExtensionToWebviewMessage) => void
): Promise<AcpSessionBridge | undefined> {
    const existing = bridgesBySessionId.get(sessionId);
    if (existing !== undefined) {
        return existing;
    }
    const config = agentConfigBySessionId.get(sessionId) ?? pickAgentConfig();
    if (!config) {
        post({ type: "error", message: "No ACP agents configured. Add agents in settings (ib-utilities.acpAgents)." });
        return undefined;
    }
    const bridge = new AcpSessionBridge(config, post);
    bridgesBySessionId.set(sessionId, bridge);
    const preferredModelId = pendingModelIdBySessionId.get(sessionId);
    try {
        await bridge.connect(preferredModelId);
        pendingModelIdBySessionId.delete(sessionId);
        return bridge;
    } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err);
        post({ type: "error", message: `Failed to connect to agent: ${message}` });
        bridge.dispose();
        bridgesBySessionId.delete(sessionId);
        return undefined;
    }
}

async function handleSend(sessionId: string, body: string, post: (msg: ExtensionToWebviewMessage) => void): Promise<void> {
    const bridge = await ensureBridgeConnected(sessionId, post);
    if (bridge === undefined) {
        return;
    }
    void bridge.prompt(body);
}

async function handleSetSessionModel(
    sessionId: string,
    modelId: string,
    post: (msg: ExtensionToWebviewMessage) => void
): Promise<void> {
    const bridge = bridgesBySessionId.get(sessionId);
    if (bridge) {
        try {
            await bridge.setSessionModel(modelId);
        } catch (err: unknown) {
            const message = err instanceof Error ? err.message : String(err);
            post({ type: "error", message: `Model change failed: ${message}` });
        }
        return;
    }
    pendingModelIdBySessionId.set(sessionId, modelId);
}

async function handleCancel(sessionId: string): Promise<void> {
    const bridge = bridgesBySessionId.get(sessionId);
    if (bridge) {
        await bridge.cancel();
    }
}

function handleSetSessionAgent(sessionId: string, agentName: string, post: (msg: ExtensionToWebviewMessage) => void): void {
    const config = getAcpAgentConfigByName(agentName);
    if (!config) {
        post({ type: "error", message: `Unknown agent: ${agentName}` });
        return;
    }
    agentConfigBySessionId.set(sessionId, config);
    setIbChatSessionAgentName(sessionId, config.name);
    const existingBridge = bridgesBySessionId.get(sessionId);
    if (existingBridge) {
        existingBridge.dispose();
        bridgesBySessionId.delete(sessionId);
    }
    pendingModelIdBySessionId.delete(sessionId);
    post({
        type: "acpAgentSelection",
        currentAgentName: config.name,
        availableAgentNames: getAcpAgentConfigs().map((c) => c.name),
    });
    void ensureBridgeConnected(sessionId, post);
}

function pickAgentConfig(): AcpAgentConfig | undefined {
    const configs = getAcpAgentConfigs();
    return configs[0];
}
