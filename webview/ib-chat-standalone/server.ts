/**
 * Standalone bridge server for the IB Chat UI.
 *
 * Starts a WebSocket server on port 5174. Each incoming connection gets its own
 * ACP agent subprocess and session. The Vite dev server at port 5173 proxies
 * `/__ib_chat_ws` traffic here.
 *
 * Agent subprocess is defined by `acp-agent.json` in this directory (next to this file).
 * Shape: `{ "name": "...", "command": "...", "args": ["..."], "env": { "KEY": "value" } }`
 * — `args` and `env` are optional.
 *
 * Usage (two terminals):
 *   npm run dev:standalone:server
 *   npm run dev:standalone:ui
 */

import { createServer } from "node:http";
import { randomUUID } from "node:crypto";
import { readFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";
import { Readable, Writable } from "node:stream";
import { WebSocketServer, WebSocket } from "ws";
import * as acp from "@agentclientprotocol/sdk";
import type {
    ExtensionToWebviewMessage,
    WebviewToExtensionMessage,
} from "../../src/chat/protocol/ibChatProtocol.ts";
import { sessionUpdateToWebviewMessages } from "../../src/chat/acp/acpSessionUpdateMapping.ts";
import {
    parseAcpAgentSpawnConfig,
    type AcpAgentSpawnConfig,
} from "../../src/chat/acp/acpAgentSpawnConfig.ts";

const PORT = Number(process.env["ACP_WS_PORT"] ?? 5174);

function loadAgentConfig(): AcpAgentSpawnConfig {
    const configPath = join(dirname(fileURLToPath(import.meta.url)), "acp-agent.json");

    if (!existsSync(configPath)) {
        console.error(`ACP agent config not found: ${configPath}`);
        console.error(
            "Add acp-agent.json next to server.ts with name, command, and optional args (string array) and env (string map)."
        );
        process.exit(1);
    }
    let parsed: unknown;
    try {
        parsed = JSON.parse(readFileSync(configPath, "utf-8"));
    } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err);
        console.error(`Failed to read or parse ACP agent config ${configPath}: ${message}`);
        process.exit(1);
    }
    const cfg = parseAcpAgentSpawnConfig(parsed);
    if (!cfg) {
        console.error(
            `Invalid ACP agent config in ${configPath}: expected JSON object with string "name", string "command", optional "args" (string array), optional "env" (string values only).`
        );
        process.exit(1);
    }
    return cfg;
}

const agentConfig = loadAgentConfig();

const httpServer = createServer();
const wss = new WebSocketServer({ server: httpServer });

wss.on("connection", (ws: WebSocket) => {
    const sessionId = randomUUID();
    console.log(`[standalone] client connected  session=${sessionId}`);

    let acpConnection: acp.ClientSideConnection | null = null;
    let acpSessionId: string | null = null;
    let prompting = false;

    function send(msg: ExtensionToWebviewMessage): void {
        if (ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify(msg));
        }
    }

    async function connectAgent(): Promise<void> {
        const child = spawn(agentConfig.command, agentConfig.args, {
            stdio: ["pipe", "pipe", "pipe"],
            cwd: process.cwd(),
            env: { ...process.env, ...agentConfig.env },
        });

        child.stderr?.on("data", (chunk: Buffer) => {
            process.stderr.write(`[${agentConfig.name}] ${chunk.toString()}`);
        });
        child.on("error", (err) => {
            console.error(`[${agentConfig.name}] process error:`, err);
            send({ type: "error", message: `Agent process error: ${err.message}` });
        });
        child.on("exit", (code) => {
            if (code !== 0) {
                send({ type: "error", message: `Agent process exited with code ${code ?? "null"}.` });
            }
        });

        const input = Writable.toWeb(child.stdin!);
        const output = Readable.toWeb(child.stdout!) as ReadableStream<Uint8Array>;
        const stream = acp.ndJsonStream(input, output);

        const client: acp.Client = {
            requestPermission: async (params) => {
                const first = params.options[0];
                if (!first) {
                    return { outcome: { outcome: "cancelled" } };
                }
                return { outcome: { outcome: "selected", optionId: first.optionId } };
            },
            sessionUpdate: async (params) => {
                const messages = sessionUpdateToWebviewMessages(params.update);
                for (const msg of messages) {
                    send(msg);
                }
            },
            readTextFile: async (params) => {
                const { readFile } = await import("node:fs/promises");
                const content = await readFile(params.path, "utf-8");
                return { content };
            },
            writeTextFile: async (params) => {
                const { writeFile } = await import("node:fs/promises");
                await writeFile(params.path, params.content, "utf-8");
                return {};
            },
        };

        acpConnection = new acp.ClientSideConnection((_agent) => client, stream);

        await acpConnection.initialize({
            protocolVersion: acp.PROTOCOL_VERSION,
            clientCapabilities: {
                fs: { readTextFile: true, writeTextFile: true },
            },
        });

        const result = await acpConnection.newSession({ cwd: process.cwd(), mcpServers: [] });
        acpSessionId = result.sessionId;
    }

    const handleMessage = async (raw: string): Promise<void> => {
        let parsed: WebviewToExtensionMessage;
        try {
            parsed = JSON.parse(raw) as WebviewToExtensionMessage;
        } catch {
            return;
        }

        if (parsed.type === "ready") {
            send({
                type: "init",
                sessionId,
                title: "IB Chat",
                workspaceLabel: process.cwd(),
                agentVersionLabel: undefined,
                acpAgentName: agentConfig.name,
            });
            return;
        }

        if (parsed.type === "send") {
            if (!acpConnection || !acpSessionId) {
                try {
                    await connectAgent();
                } catch (err: unknown) {
                    const message = err instanceof Error ? err.message : String(err);
                    send({ type: "error", message: `Failed to connect to agent: ${message}` });
                    return;
                }
            }
            prompting = true;
            try {
                const result = await acpConnection!.prompt({
                    sessionId: acpSessionId!,
                    prompt: [{ type: "text", text: parsed.body }],
                });
                send({ type: "turnComplete", stopReason: result.stopReason });
            } catch (err: unknown) {
                const message = err instanceof Error ? err.message : String(err);
                send({ type: "error", message });
            } finally {
                prompting = false;
            }
            return;
        }

        if (parsed.type === "cancel" && acpSessionId && acpConnection) {
            if (prompting) {
                await acpConnection.cancel({ sessionId: acpSessionId });
            }
            return;
        }
    };

    ws.on("message", (data) => {
        void handleMessage(data.toString());
    });

    ws.on("close", () => {
        console.log(`[standalone] client disconnected session=${sessionId}`);
    });
});

httpServer.listen(PORT, () => {
    const argLine = agentConfig.args.length > 0 ? ` ${agentConfig.args.join(" ")}` : "";
    console.log(`[standalone] WebSocket bridge listening on ws://localhost:${PORT}`);
    console.log(`[standalone] Agent: ${agentConfig.command}${argLine}`);
    console.log(`[standalone] Open http://localhost:5173 after starting the Vite dev server`);
});
