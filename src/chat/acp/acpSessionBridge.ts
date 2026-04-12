import type * as acp from "@agentclientprotocol/sdk";
import { AcpAgentProcess } from "./acpAgentProcess";
import type { AcpAgentConfig } from "./acpAgentConfig";
import type { WebviewToExtensionMessage } from "../protocol/ibChatProtocol";
import {
    sessionModelStateToIbChatSelection,
    type IbChatSessionModelSelection,
} from "./agentSession/ibChatSessionModels";
import {
    createToolCallKindTracking,
    sessionUpdateToWebviewMessages,
    toolCallExecuteCommandSubtitle,
} from "./acpSessionUpdateMapping";
import type { ExtensionToWebviewMessage, ToolCallStatus } from "../protocol/ibChatProtocol";

/** Callback that forwards an extension-to-webview message to the panel. */
export type PostToWebview = (message: ExtensionToWebviewMessage) => void;

/**
 * Bridges a single IB Chat session to an ACP agent process. Translates
 * ACP session/update notifications into webview protocol messages and
 * routes user prompts to the agent.
 */
export class AcpSessionBridge {
    private agentProcess: AcpAgentProcess;
    private acpSessionId: string | null = null;
    private prompting = false;
    private lastModelSelection: IbChatSessionModelSelection | null = null;
    private toolCallKindTracking = createToolCallKindTracking();
    private nextPermissionRequestId = 0;
    private permissionWaiters = new Map<string, (outcome: acp.RequestPermissionResponse) => void>();

    constructor(
        private readonly config: AcpAgentConfig,
        private readonly postToWebview: PostToWebview
    ) {
        this.agentProcess = new AcpAgentProcess(config, (params) => this.queuePermissionRequest(params));
        this.agentProcess.onSessionUpdate((params) => this.handleSessionUpdate(params));
    }

    private async queuePermissionRequest(params: acp.RequestPermissionRequest): Promise<acp.RequestPermissionResponse> {
        const requestId = `perm-${this.nextPermissionRequestId++}`;
        const toolCall = params.toolCall;
        const commandSubtitle = toolCallExecuteCommandSubtitle(toolCall);
        return new Promise((resolve) => {
            this.permissionWaiters.set(requestId, resolve);
            this.postToWebview({
                type: "permissionRequest",
                requestId,
                toolTitle: toolCall.title ?? "Tool",
                options: params.options.map((o) => ({ optionId: o.optionId, name: o.name })),
            });
            if (commandSubtitle !== undefined && typeof toolCall.toolCallId === "string" && toolCall.toolCallId.length > 0) {
                const rawStatus = toolCall.status;
                const status: ToolCallStatus =
                    rawStatus === "failed" ||
                    rawStatus === "completed" ||
                    rawStatus === "in_progress" ||
                    rawStatus === "pending"
                        ? rawStatus
                        : "pending";
                this.postToWebview({
                    type: "updateToolCall",
                    toolCallId: toolCall.toolCallId,
                    status,
                    subtitle: commandSubtitle,
                });
            }
        });
    }

    /**
     * Completes a pending `session/request_permission` from the webview dialog.
     */
    handlePermissionResponse(message: Extract<WebviewToExtensionMessage, { type: "permissionResponse" }>): void {
        const resolve = this.permissionWaiters.get(message.requestId);
        if (resolve === undefined) {
            return;
        }
        this.permissionWaiters.delete(message.requestId);
        if ("cancelled" in message && message.cancelled === true) {
            resolve({ outcome: { outcome: "cancelled" } });
            return;
        }
        if ("selectedOptionId" in message) {
            resolve({ outcome: { outcome: "selected", optionId: message.selectedOptionId } });
        }
    }

    private cancelPendingPermissions(): void {
        for (const resolve of this.permissionWaiters.values()) {
            resolve({ outcome: { outcome: "cancelled" } });
        }
        this.permissionWaiters.clear();
    }

    /**
     * Starts the agent process and creates an ACP session. If `preferredModelId` is set and the
     * session advertises models, applies it before the first `sessionModels` message to the webview.
     */
    async connect(preferredModelId?: string): Promise<void> {
        await this.agentProcess.start();
        const result = await this.agentProcess.newSession();
        this.acpSessionId = result.sessionId;
        if (result.models) {
            let state = result.models;
            if (preferredModelId !== undefined && preferredModelId !== state.currentModelId) {
                try {
                    await this.agentProcess.setSessionModel(result.sessionId, preferredModelId);
                    state = { ...state, currentModelId: preferredModelId };
                } catch {}
            }
            const selection = sessionModelStateToIbChatSelection(state);
            this.lastModelSelection = selection;
            this.postToWebview({ type: "sessionModels", ...selection });
        }
    }

    /** Updates the session model when the agent supports `session/set_model`. */
    async setSessionModel(modelId: string): Promise<void> {
        if (!this.acpSessionId) {
            return;
        }
        await this.agentProcess.setSessionModel(this.acpSessionId, modelId);
        if (this.lastModelSelection !== null) {
            const next: IbChatSessionModelSelection = {
                ...this.lastModelSelection,
                currentModelId: modelId,
            };
            this.lastModelSelection = next;
            this.postToWebview({ type: "sessionModels", ...next });
        }
    }

    /** Sends a user prompt. The bridge forwards all session updates to the webview. */
    async prompt(text: string): Promise<void> {
        if (!this.acpSessionId) {
            this.postToWebview({ type: "error", message: "Agent session not connected." });
            return;
        }
        this.toolCallKindTracking = createToolCallKindTracking();
        this.prompting = true;
        try {
            const result = await this.agentProcess.prompt(this.acpSessionId, text);
            this.postToWebview({ type: "turnComplete", stopReason: result.stopReason });
        } catch (err: unknown) {
            const message = err instanceof Error ? err.message : String(err);
            this.postToWebview({ type: "error", message });
        } finally {
            this.prompting = false;
        }
    }

    /** Cancels the current prompt turn, if one is in progress. */
    async cancel(): Promise<void> {
        this.cancelPendingPermissions();
        if (!this.prompting || !this.acpSessionId) {
            return;
        }
        await this.agentProcess.cancel(this.acpSessionId);
    }

    /** Whether a prompt is currently in flight. */
    get isPrompting(): boolean {
        return this.prompting;
    }

    /** Kills the agent process and releases resources. */
    dispose(): void {
        this.cancelPendingPermissions();
        this.agentProcess.dispose();
        this.acpSessionId = null;
    }

    private handleSessionUpdate(params: acp.SessionNotification): void {
        const messages = sessionUpdateToWebviewMessages(params.update, this.toolCallKindTracking);
        for (const msg of messages) {
            this.postToWebview(msg);
        }
    }
}
