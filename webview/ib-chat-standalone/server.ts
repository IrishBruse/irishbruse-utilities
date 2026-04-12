/**
 * Standalone bridge server for the IB Chat UI.
 *
 * Starts a WebSocket server on port 5174. Each incoming connection gets its own
 * ACP agent subprocess and session. The Vite dev server at port 5173 proxies
 * `/__ib_chat_ws` traffic here.
 *
 * Agent subprocesses are defined by `acp-agent.json` in this directory (next to this file).
 * Shape: a JSON array of agents `[{ "name": "...", "command": "...", "args": ["..."], "env": {} }, ...]`
 * — `args` and `env` are optional. A single agent object is also accepted.
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
import { spawn, type ChildProcess } from "node:child_process";
import { Readable, Writable, Transform } from "node:stream";
import { WebSocketServer, WebSocket } from "ws";
import * as acp from "@agentclientprotocol/sdk";
import { tryParseWebviewMessage, type ExtensionToWebviewMessage } from "../../src/chat/protocol/ibChatProtocol";
import {
    sessionModelStateToIbChatSelection,
    type IbChatSessionModelSelection,
} from "../../src/chat/acp/agentSession/ibChatSessionModels";
import { parseSessionModelsFromReadmeNdjson } from "../../src/chat/acp/agentSession/readmeSessionNew";
import {
    createToolCallKindTracking,
    extensionMessagesForPermissionRequest,
    sessionUpdateToWebviewMessages,
} from "../../src/chat/acp/acpSessionUpdateMapping";
import {
    parseAcpAgentsJsonFileContent,
    type AcpAgentSpawnConfig,
} from "../../src/chat/acp/acpAgentSpawnConfig";

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

function ndJsonStreamArgsForChild(child: ReturnType<typeof spawn>): {
    stdinWeb: WritableStream;
    stdoutWeb: ReadableStream<Uint8Array>;
} {
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

/** Pause between successive NDJSON lines during fixture replay. */
const fixtureLineDelayMs = 100;

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
 * Replays a fixture in file order: pauses briefly between each NDJSON line, maps session/update
 * lines through the normal path, then returns the recorded stopReason from prompt responses.
 */
async function replayFixture(fixturePath: string, send: (msg: ExtensionToWebviewMessage) => void): Promise<string> {
    const lines = readFileSync(fixturePath, "utf-8")
        .split("\n")
        .filter((l) => l.trim().length > 0);

    let stopReason = "end_turn";
    const toolKindTracking = createToolCallKindTracking();

    for (let i = 0; i < lines.length; i++) {
        if (i > 0) {
            await new Promise<void>((resolve) => setTimeout(resolve, fixtureLineDelayMs));
        }

        const msg = JSON.parse(lines[i]) as JsonRpcNotification | JsonRpcResponse;

        if ("method" in msg && msg.method === "session/update") {
            const params = (msg as JsonRpcNotification).params as { update: acp.SessionUpdate };
            const messages = sessionUpdateToWebviewMessages(params.update, toolKindTracking);
            for (const webviewMessage of messages) {
                send(webviewMessage);
                await new Promise<void>((resolve) => setImmediate(resolve));
            }
            continue;
        }

        if ("method" in msg && msg.method === "session/request_permission") {
            const params = (msg as JsonRpcNotification).params as acp.RequestPermissionRequest;
            const requestId = `perm-replay-${i}`;
            for (const webviewMessage of extensionMessagesForPermissionRequest(requestId, params)) {
                send(webviewMessage);
                await new Promise<void>((resolve) => setImmediate(resolve));
            }
            continue;
        }

        if (!("method" in msg) && "result" in msg) {
            const result = (msg as JsonRpcResponse).result;
            if (typeof result["stopReason"] === "string") {
                stopReason = result["stopReason"];
            }
        }
    }

    return stopReason;
}

// ── Agent config ─────────────────────────────────────────────────────────────

function loadAgentConfigs(): AcpAgentSpawnConfig[] {
    const configPath = join(STANDALONE_DIR, "acp-agent.json");
    if (!existsSync(configPath)) {
        console.error(`ACP agent config not found: ${configPath}`);
        console.error(
            "Add acp-agent.json next to server.ts: a JSON array of agents (each with string name, command, optional args, optional env), or one agent object."
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
    const list = parseAcpAgentsJsonFileContent(parsed);
    if (list === undefined || list.length === 0) {
        console.error(
            `Invalid ACP agent config in ${configPath}: expected a non-empty array of valid agent objects (or one valid agent object).`
        );
        process.exit(1);
    }
    return list;
}

const agentConfigs = loadAgentConfigs();

function loadReadmeSessionModels(): IbChatSessionModelSelection | null {
    try {
        const text = readFileSync(join(STANDALONE_DIR, "mock/readme.ndjson"), "utf-8");
        return parseSessionModelsFromReadmeNdjson(text);
    } catch {
        return null;
    }
}

// ── WebSocket server ──────────────────────────────────────────────────────────

const httpServer = createServer();
const wss = new WebSocketServer({ server: httpServer });

wss.on("connection", (ws: WebSocket) => {
    const sessionId = randomUUID();
    console.log(`client connected  session=${sessionId}`);

    let acpConnection: acp.ClientSideConnection | null = null;
    let acpSessionId: string | null = null;
    let prompting = false;
    let pendingModelId: string | null = null;
    let lastModelSelection: IbChatSessionModelSelection | null = null;
    let toolKindTracking = createToolCallKindTracking();
    let selectedAgentName = agentConfigs[0]!.name;
    let agentChild: ChildProcess | null = null;
    let nextPermissionRequestId = 0;
    const permissionWaiters = new Map<string, (outcome: acp.RequestPermissionResponse) => void>();
    let connectInFlight: Promise<void> | null = null;

    function send(msg: ExtensionToWebviewMessage): void {
        if (ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify(msg));
        }
    }

    function activeAgentConfig(): AcpAgentSpawnConfig {
        const found = agentConfigs.find((c) => c.name === selectedAgentName);
        return found ?? agentConfigs[0]!;
    }

    function disposeAgentConnection(): void {
        if (agentChild !== null) {
            agentChild.kill();
            agentChild = null;
        }
        acpConnection = null;
        acpSessionId = null;
        for (const resolve of permissionWaiters.values()) {
            resolve({ outcome: { outcome: "cancelled" } });
        }
        permissionWaiters.clear();
    }

    async function runConnectAgent(): Promise<void> {
        disposeAgentConnection();
        const cfg = activeAgentConfig();
        const child = spawn(cfg.command, cfg.args, {
            stdio: ["pipe", "pipe", "pipe"],
            cwd: process.cwd(),
            env: { ...process.env, ...cfg.env },
        });
        agentChild = child;

        child.stderr?.on("data", (chunk: Buffer) => {
            process.stderr.write(`[${cfg.name}] ${chunk.toString()}`);
        });
        child.on("error", (err) => {
            console.error(`[${cfg.name}] process error:`, err);
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
                const requestId = `perm-${nextPermissionRequestId++}`;
                return new Promise((resolve) => {
                    permissionWaiters.set(requestId, resolve);
                    for (const msg of extensionMessagesForPermissionRequest(requestId, params)) {
                        send(msg);
                    }
                });
            },
            sessionUpdate: async (params) => {
                const messages = sessionUpdateToWebviewMessages(params.update, toolKindTracking);
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
        const preferred = pendingModelId;
        pendingModelId = null;
        if (result.models) {
            let state = result.models;
            if (preferred !== null && preferred !== state.currentModelId) {
                try {
                    await acpConnection.unstable_setSessionModel({
                        sessionId: result.sessionId,
                        modelId: preferred,
                    });
                    state = { ...state, currentModelId: preferred };
                } catch {}
            }
            const selection = sessionModelStateToIbChatSelection(state);
            lastModelSelection = selection;
            send({ type: "sessionModels", ...selection });
        }
    }

    async function connectAgent(): Promise<void> {
        if (acpConnection !== null && acpSessionId !== null) {
            return;
        }
        if (connectInFlight !== null) {
            await connectInFlight;
            return;
        }
        const started = runConnectAgent();
        connectInFlight = started;
        try {
            await started;
        } finally {
            connectInFlight = null;
        }
    }

    const handleMessage = async (raw: string): Promise<void> => {
        let rawObj: unknown;
        try {
            rawObj = JSON.parse(raw) as unknown;
        } catch {
            return;
        }
        const parsed = tryParseWebviewMessage(rawObj);
        if (parsed === null) {
            return;
        }

        if (parsed.type === "ready") {
            const seed = loadReadmeSessionModels();
            lastModelSelection = seed;
            send({
                type: "init",
                sessionId,
                title: "IB Chat",
                workspaceLabel: process.cwd(),
                agentVersionLabel: undefined,
                acpAgentName: selectedAgentName,
                availableAcpAgents: agentConfigs.map((c) => c.name),
                sessionModels: seed ?? undefined,
            });
            void connectAgent().catch((err: unknown) => {
                const message = err instanceof Error ? err.message : String(err);
                send({ type: "error", message: `Failed to connect to agent: ${message}` });
            });
            return;
        }

        if (parsed.type === "permissionResponse") {
            const resolve = permissionWaiters.get(parsed.requestId);
            if (resolve === undefined) {
                return;
            }
            permissionWaiters.delete(parsed.requestId);
            if ("cancelled" in parsed && parsed.cancelled === true) {
                resolve({ outcome: { outcome: "cancelled" } });
            } else if ("selectedOptionId" in parsed) {
                resolve({ outcome: { outcome: "selected", optionId: parsed.selectedOptionId } });
            }
            return;
        }

        if (parsed.type === "setSessionAgent") {
            const next = agentConfigs.find((c) => c.name === parsed.agentName);
            if (next === undefined) {
                send({ type: "error", message: `Unknown agent: ${parsed.agentName}` });
                return;
            }
            selectedAgentName = next.name;
            disposeAgentConnection();
            lastModelSelection = null;
            pendingModelId = null;
            send({
                type: "acpAgentSelection",
                currentAgentName: next.name,
                availableAgentNames: agentConfigs.map((c) => c.name),
            });
            return;
        }

        if (parsed.type === "savePromptHistory") {
            return;
        }

        if (parsed.type === "setSessionModel") {
            if (acpConnection && acpSessionId) {
                try {
                    await acpConnection.unstable_setSessionModel({
                        sessionId: acpSessionId,
                        modelId: parsed.modelId,
                    });
                    if (lastModelSelection !== null) {
                        lastModelSelection = {
                            ...lastModelSelection,
                            currentModelId: parsed.modelId,
                        };
                        send({ type: "sessionModels", ...lastModelSelection });
                    }
                } catch (err: unknown) {
                    const message = err instanceof Error ? err.message : String(err);
                    send({ type: "error", message: `Model change failed: ${message}` });
                }
            } else {
                pendingModelId = parsed.modelId;
            }
            return;
        }

        if (parsed.type === "send") {
            const fixturePath = resolveFixture(parsed.body);
            if (fixturePath !== null) {
                console.log(`fixture: replaying ${fixturePath}`);
                prompting = true;
                toolKindTracking = createToolCallKindTracking();
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
            toolKindTracking = createToolCallKindTracking();
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
        disposeAgentConnection();
        console.log(`client disconnected session=${sessionId}`);
    });
});

httpServer.listen(PORT, () => {
    console.log(`WebSocket bridge listening on ws://localhost:${PORT}`);
    for (const c of agentConfigs) {
        const argLine = c.args.length > 0 ? ` ${c.args.join(" ")}` : "";
        console.log(`Agent "${c.name}": ${c.command}${argLine}`);
    }
    console.log(`Open http://localhost:5173 after starting the Vite dev server`);
    if (rpcLogPath !== null) {
        getRpcLogStream();
    }
});
