import type * as acp from "@agentclientprotocol/sdk";
import { AcpAgentProcess } from "./acpAgentProcess";
import type { AcpAgentConfig } from "./acpAgentConfig";
import { sessionUpdateToWebviewMessages } from "./acpSessionUpdateMapping";
import type { ExtensionToWebviewMessage } from "../protocol/ibChatProtocol";

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

    constructor(
        private readonly config: AcpAgentConfig,
        private readonly postToWebview: PostToWebview
    ) {
        this.agentProcess = new AcpAgentProcess(config);
        this.agentProcess.onSessionUpdate((params) => this.handleSessionUpdate(params));
    }

    /** Starts the agent process and creates an ACP session. */
    async connect(): Promise<void> {
        await this.agentProcess.start();
        this.acpSessionId = await this.agentProcess.newSession();
    }

    /** Sends a user prompt. The bridge forwards all session updates to the webview. */
    async prompt(text: string): Promise<void> {
        if (!this.acpSessionId) {
            this.postToWebview({ type: "error", message: "Agent session not connected." });
            return;
        }
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
        this.agentProcess.dispose();
        this.acpSessionId = null;
    }

    private handleSessionUpdate(params: acp.SessionNotification): void {
        const messages = sessionUpdateToWebviewMessages(params.update);
        for (const msg of messages) {
            this.postToWebview(msg);
        }
    }
}
