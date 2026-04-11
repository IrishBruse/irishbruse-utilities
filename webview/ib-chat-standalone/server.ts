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
 * JSON-RPC over NDJSON on the agent stdio is appended to `acp-rpc.ndjson` next to this file by default.
 * Set `ACP_RPC_LOG=0` to disable, `ACP_RPC_LOG=/path/file.ndjson` for a custom file, or `ACP_RPC_LOG=1` for the default path explicitly.
 *
 * Fixture playback: type a fixture name in the chat to replay a recorded NDJSON session instead of
 * hitting the real agent. Use `mock-<stem>` for `mock/<stem>.ndjson` (e.g. `mock-readme` for
 * `mock/readme.ndjson`). Other names resolve to `<name>.ndjson` next to this file.
 *
 * Usage:
 *   npm run dev:standalone
 */

import { createServer } from "node:http";
import { randomUUID } from "node:crypto";
import { readFileSync, existsSync, createWriteStream } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";
import { Readable, Writable, Transform } from "node:stream";
import { WebSocketServer, WebSocket } from "ws";
import * as acp from "@agentclientprotocol/sdk";
import type { ExtensionToWebviewMessage, WebviewToExtensionMessage } from "../../src/chat/protocol/ibChatProtocol";
import { sessionUpdateToWebviewMessages } from "../../src/chat/acp/acpSessionUpdateMapping";
import { parseAcpAgentSpawnConfig, type AcpAgentSpawnConfig } from "../../src/chat/acp/acpAgentSpawnConfig";

const PORT = Number(process.env["ACP_WS_PORT"] ?? 5174);
const STANDALONE_DIR = dirname(fileURLToPath(import.meta.url));

// ── RPC logging ──────────────────────────────────────────────────────────────

const rpcLogEnv = process.env["ACP_RPC_LOG"];
const defaultRpcLogFile = join(STANDALONE_DIR, "acp-rpc.ndjson");
const rpcLogPath: string | null = ((): string | null => {
    if (rpcLogEnv === "0" || rpcLogEnv === "false" || rpcLogEnv === "") {
        return null;
    }
    if (rpcLogEnv === undefined) {
        return defaultRpcLogFile;
    }
    if (rpcLogEnv === "1" || rpcLogEnv === "true") {
        return defaultRpcLogFile;
    }
    return rpcLogEnv;
})();

let globalRpcLog: ReturnType<typeof createWriteStream> | null = null;

function getRpcLogStream(): ReturnType<typeof createWriteStream> | null {
    if (rpcLogPath === null) {
        return null;
    }
    if (globalRpcLog === null) {
        globalRpcLog = createWriteStream(rpcLogPath, { flags: "a" });
        globalRpcLog.on("error", (err) => {
            console.error("ACP RPC log write error:", err);
        });
        console.log(`ACP JSON-RPC log: ${rpcLogPath}`);
    }
    return globalRpcLog;
}

/**
 * Passes bytes through while appending each complete NDJSON line verbatim to the log file.
 */
function createNdjsonRpcLogTransform(logStream: ReturnType<typeof createWriteStream>): Transform {
    let buffer = "";
    return new Transform({
        transform(chunk: Buffer, chunkEncoding: BufferEncoding, callback): void {
            void chunkEncoding;
            buffer += chunk.toString("utf8");
            const parts = buffer.split("\n");
            buffer = parts.pop() ?? "";
            for (const part of parts) {
                const trimmed = part.trim();
                if (trimmed.length > 0) {
                    logStream.write(`${trimmed}\n`);
                }
            }
            callback(null, chunk);
        },
        flush(callback): void {
            const trimmed = buffer.trim();
            if (trimmed.length > 0) {
                logStream.write(`${trimmed}\n`);
            }
            buffer = "";
            callback();
        },
    });
}

function ndJsonStreamArgsForChild(
    child: ReturnType<typeof spawn>
): { stdinWeb: WritableStream; stdoutWeb: ReadableStream<Uint8Array> } {
    const logStream = getRpcLogStream();
    if (logStream === null) {
        return {
            stdinWeb: Writable.toWeb(child.stdin!),
            stdoutWeb: Readable.toWeb(child.stdout!) as ReadableStream<Uint8Array>,
        };
    }
    const towardAgent = createNdjsonRpcLogTransform(logStream);
    towardAgent.pipe(child.stdin!);
    const fromAgent = createNdjsonRpcLogTransform(logStream);
    child.stdout!.pipe(fromAgent);
    return {
        stdinWeb: Writable.toWeb(towardAgent),
        stdoutWeb: Readable.toWeb(fromAgent) as ReadableStream<Uint8Array>,
    };
}

// ── Fixture playback ─────────────────────────────────────────────────────────

type JsonRpcNotification = { jsonrpc: "2.0"; method: string; params: unknown };
type JsonRpcResponse = { jsonrpc: "2.0"; id: number | string; result: Record<string, unknown> };

/**
 * Reads a fixture NDJSON file and extracts session/update notifications and the prompt stop reason.
 * Any line that is a client→agent request is skipped.
 */
function loadFixture(fixturePath: string): { updates: acp.SessionUpdate[]; stopReason: string } {
    const lines = readFileSync(fixturePath, "utf-8")
        .split("\n")
        .filter((l) => l.trim().length > 0);

    const updates: acp.SessionUpdate[] = [];
    let stopReason = "end_turn";

    for (const line of lines) {
        const msg = JSON.parse(line) as JsonRpcNotification | JsonRpcResponse;

        if ("method" in msg && msg.method === "session/update") {
            const params = (msg as JsonRpcNotification).params as { update: acp.SessionUpdate };
            updates.push(params.update);
            continue;
        }

        if (!("method" in msg) && "result" in msg) {
            const result = (msg as JsonRpcResponse).result;
            if (typeof result["stopReason"] === "string") {
                stopReason = result["stopReason"];
            }
        }
    }

    return { updates, stopReason };
}

/**
 * Resolves a fixture path: `mock-<stem>` maps to `mock/<stem>.ndjson` under this directory;
 * otherwise `<keyword>.ndjson` next to server.ts.
 */
function resolveFixture(body: string): string | null {
    const candidate = body.trim();
    if (!/^[a-z0-9-]+$/.test(candidate)) {
        return null;
    }
    const mockPrefix = "mock-";
    if (candidate.startsWith(mockPrefix) && candidate.length > mockPrefix.length) {
        const stem = candidate.slice(mockPrefix.length);
        if (/^[a-z0-9-]+$/.test(stem)) {
            const mockPath = join(STANDALONE_DIR, "mock", `${stem}.ndjson`);
            if (existsSync(mockPath)) {
                return mockPath;
            }
        }
    }
    const fixturePath = join(STANDALONE_DIR, `${candidate}.ndjson`);
    return existsSync(fixturePath) ? fixturePath : null;
}

/**
 * Replays a fixture: streams each session/update through the normal mapping,
 * then sends turnComplete with the recorded stopReason.
 */
async function replayFixture(
    fixturePath: string,
    send: (msg: ExtensionToWebviewMessage) => void
): Promise<string> {
    const { updates, stopReason } = loadFixture(fixturePath);
    for (const update of updates) {
        const messages = sessionUpdateToWebviewMessages(update);
        for (const msg of messages) {
            send(msg);
            await new Promise<void>((resolve) => setImmediate(resolve));
        }
    }
    return stopReason;
}

// ── Agent config ─────────────────────────────────────────────────────────────

function loadAgentConfig(): AcpAgentSpawnConfig {
    const configPath = join(STANDALONE_DIR, "acp-agent.json");
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

// ── WebSocket server ──────────────────────────────────────────────────────────

const httpServer = createServer();
const wss = new WebSocketServer({ server: httpServer });

wss.on("connection", (ws: WebSocket) => {
    const sessionId = randomUUID();
    console.log(`client connected  session=${sessionId}`);

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

        const { stdinWeb, stdoutWeb } = ndJsonStreamArgsForChild(child);
        const stream = acp.ndJsonStream(stdinWeb, stdoutWeb);

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
            const fixturePath = resolveFixture(parsed.body);
            if (fixturePath !== null) {
                console.log(`fixture: replaying ${fixturePath}`);
                prompting = true;
                try {
                    const stopReason = await replayFixture(fixturePath, send);
                    send({ type: "turnComplete", stopReason });
                } catch (err: unknown) {
                    const message = err instanceof Error ? err.message : String(err);
                    send({ type: "error", message: `Fixture replay error: ${message}` });
                } finally {
                    prompting = false;
                }
                return;
            }

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
        console.log(`client disconnected session=${sessionId}`);
    });
});

httpServer.listen(PORT, () => {
    const argLine = agentConfig.args.length > 0 ? ` ${agentConfig.args.join(" ")}` : "";
    console.log(`WebSocket bridge listening on ws://localhost:${PORT}`);
    console.log(`Agent: ${agentConfig.command}${argLine}`);
    console.log(`Open http://localhost:5173 after starting the Vite dev server`);
    if (rpcLogPath !== null) {
        getRpcLogStream();
    }
});
