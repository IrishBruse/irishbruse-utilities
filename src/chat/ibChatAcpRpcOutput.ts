import { createWriteStream, type WriteStream } from "node:fs";
import type { OutputChannel } from "vscode";

let channel: OutputChannel | null = null;
let logFilePath: string | null = null;
let logFileStream: WriteStream | null = null;

function getOrCreateLogFileStream(): WriteStream | null {
    if (logFilePath === null) {
        return null;
    }
    if (logFileStream === null) {
        logFileStream = createWriteStream(logFilePath, { flags: "a" });
        logFileStream.on("error", (err: Error) => {
            console.error("IB Chat ACP RPC log file write error:", err);
        });
    }
    return logFileStream;
}

/**
 * Binds the Output channel and an append-only NDJSON log file (raw JSON-RPC lines, same as on the wire).
 */
export function registerIbChatAcpRpcOutput(out: OutputChannel, absoluteLogFilePath: string): void {
    channel = out;
    logFilePath = absoluteLogFilePath;
}

/**
 * True when stdio NDJSON taps should mirror traffic to the Output channel and log file.
 */
export function isIbChatAcpRpcLoggingActive(): boolean {
    return channel !== null || logFilePath !== null;
}

/**
 * Absolute path of the append-only NDJSON log, or null before {@link registerIbChatAcpRpcOutput}.
 */
export function getIbChatAcpRpcLogFilePath(): string | null {
    return logFilePath;
}

/**
 * Ends the log file stream; invoked on extension deactivate.
 */
export function disposeIbChatAcpRpcLogFile(): void {
    if (logFileStream !== null) {
        logFileStream.end();
        logFileStream = null;
    }
}

function writeToLogFile(line: string): void {
    const stream = getOrCreateLogFileStream();
    if (stream !== null) {
        stream.write(`${line}\n`);
    }
}

/**
 * Appends one complete NDJSON line (raw), to the Output channel and log file.
 */
export function appendIbChatAcpRpcRawNdjsonLine(line: string): void {
    if (channel !== null) {
        channel.appendLine(line);
    }
    writeToLogFile(line);
}

/**
 * Returns the registered channel so commands can reveal the Output panel.
 */
export function getIbChatAcpRpcOutput(): OutputChannel | null {
    return channel;
}
