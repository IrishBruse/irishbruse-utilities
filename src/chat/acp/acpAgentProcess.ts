import { spawn, ChildProcess } from "node:child_process";
import { Readable, Writable } from "node:stream";
import * as acp from "@agentclientprotocol/sdk";
import { workspace, window } from "vscode";
import type { AcpAgentConfig } from "./acpAgentConfig";

/** Callback invoked whenever the agent sends a session/update notification. */
export type SessionUpdateHandler = (params: acp.SessionNotification) => void;

/**
 * Manages the lifecycle of a single ACP agent subprocess. Handles spawning,
 * the ACP initialize handshake, session creation, prompting, and teardown.
 */
export class AcpAgentProcess {
    private child: ChildProcess | null = null;
    private connection: acp.ClientSideConnection | null = null;
    private sessionUpdateHandler: SessionUpdateHandler | null = null;

    constructor(private readonly config: AcpAgentConfig) {}

    /** Registers a handler that receives every `session/update` notification. */
    onSessionUpdate(handler: SessionUpdateHandler): void {
        this.sessionUpdateHandler = handler;
    }

    /**
     * Spawns the agent subprocess, creates the ACP connection, and runs `initialize`.
     * See `docs/cursor-acp.md` for Cursor CLI behavior (for example sparse `tool_call` then rich `tool_call_update`).
     */
    async start(): Promise<acp.InitializeResponse> {
        const cwd = workspace.workspaceFolders?.[0]?.uri.fsPath;

        this.child = spawn(this.config.command, this.config.args, {
            stdio: ["pipe", "pipe", "pipe"],
            cwd,
            env: { ...process.env, ...this.config.env },
        });

        this.child.stderr?.on("data", (chunk: Buffer) => {
            const text = chunk.toString();
            console.error(`[ACP Agent ${this.config.name}] ${text}`);
        });

        this.child.on("error", (err) => {
            console.error(`[ACP Agent ${this.config.name}] process error:`, err);
        });

        const input = Writable.toWeb(this.child.stdin!);
        const output = Readable.toWeb(this.child.stdout!) as ReadableStream<Uint8Array>;
        const stream = acp.ndJsonStream(input, output);

        const client: acp.Client = {
            requestPermission: async (params) => this.handleRequestPermission(params),
            sessionUpdate: async (params) => {
                this.sessionUpdateHandler?.(params);
            },
            readTextFile: async (params) => this.handleReadTextFile(params),
            writeTextFile: async (params) => this.handleWriteTextFile(params),
        };

        this.connection = new acp.ClientSideConnection((_agent) => client, stream);

        const response = await this.connection.initialize({
            protocolVersion: acp.PROTOCOL_VERSION,
            clientCapabilities: {
                fs: { readTextFile: true, writeTextFile: true },
            },
        });

        return response;
    }

    /** Creates a new ACP session and returns the full agent response (includes models when supported). */
    async newSession(): Promise<acp.NewSessionResponse> {
        if (!this.connection) {
            throw new Error("Agent not started");
        }
        const cwd = workspace.workspaceFolders?.[0]?.uri.fsPath ?? process.cwd();
        return this.connection.newSession({ cwd, mcpServers: [] });
    }

    /** Sets the active model for a session when the agent supports it. */
    async setSessionModel(sessionId: string, modelId: string): Promise<void> {
        if (!this.connection) {
            throw new Error("Agent not started");
        }
        await this.connection.unstable_setSessionModel({ sessionId, modelId });
    }

    /** Sends a user prompt and waits for the turn to complete. */
    async prompt(sessionId: string, text: string): Promise<acp.PromptResponse> {
        if (!this.connection) {
            throw new Error("Agent not started");
        }
        return this.connection.prompt({
            sessionId,
            prompt: [{ type: "text", text }],
        });
    }

    /** Sends a cancel notification for the given session. */
    async cancel(sessionId: string): Promise<void> {
        if (!this.connection) {
            return;
        }
        await this.connection.cancel({ sessionId });
    }

    /** Kills the agent subprocess and cleans up resources. */
    dispose(): void {
        if (this.child) {
            this.child.kill();
            this.child = null;
        }
        this.connection = null;
    }

    private async handleRequestPermission(
        params: acp.RequestPermissionRequest
    ): Promise<acp.RequestPermissionResponse> {
        const options = params.options.map((o) => o.name);
        const picked = await window.showQuickPick(options, {
            placeHolder: `Agent wants permission: ${params.toolCall.title}`,
        });
        if (!picked) {
            return { outcome: { outcome: "cancelled" } };
        }
        const matched = params.options.find((o) => o.name === picked);
        if (!matched) {
            return { outcome: { outcome: "cancelled" } };
        }
        return { outcome: { outcome: "selected", optionId: matched.optionId } };
    }

    private async handleReadTextFile(params: acp.ReadTextFileRequest): Promise<acp.ReadTextFileResponse> {
        const uri = await import("vscode").then((vs) => vs.Uri.file(params.path));
        const bytes = await workspace.fs.readFile(uri);
        return { content: Buffer.from(bytes).toString("utf-8") };
    }

    private async handleWriteTextFile(params: acp.WriteTextFileRequest): Promise<acp.WriteTextFileResponse> {
        const uri = await import("vscode").then((vs) => vs.Uri.file(params.path));
        await workspace.fs.writeFile(uri, Buffer.from(params.content, "utf-8"));
        return {};
    }
}
