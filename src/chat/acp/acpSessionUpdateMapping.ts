import type * as acp from "@agentclientprotocol/sdk";
import type { ExtensionToWebviewMessage } from "../protocol/ibChatProtocol";

const maxToolDisplayChars = 120_000;

function lineCountForToolSummary(text: string): number {
    if (text === "") {
        return 0;
    }
    let normalized = text;
    if (normalized.endsWith("\n")) {
        normalized = normalized.slice(0, -1);
    }
    if (normalized === "") {
        return 0;
    }
    return normalized.split("\n").length;
}

function clipToolDisplayText(text: string): string {
    if (text.length <= maxToolDisplayChars) {
        return text;
    }
    return `${text.slice(0, maxToolDisplayChars)}\n\n... (truncated for display)`;
}

function formatContentBlockForTool(block: acp.ContentBlock): string | undefined {
    if (block.type === "text") {
        const t = block.text.trim();
        return t.length > 0 ? t : undefined;
    }
    return `[${block.type}]`;
}

function formatToolCallContentPiece(piece: acp.ToolCallContent): string | undefined {
    if (piece.type === "diff") {
        const pathLabel = piece.path.trim();
        const oldRaw = piece.oldText;
        const newText = piece.newText;
        const oldText = oldRaw ?? "";
        const isNewFile = oldRaw === null || oldRaw === undefined;
        const oldLineCount = lineCountForToolSummary(oldText);
        const newLineCount = lineCountForToolSummary(newText);
        const summary = isNewFile
            ? `new file (${newLineCount} line(s))`
            : `${oldLineCount} line(s) before -> ${newLineCount} line(s) after`;
        const oldDisplay = oldText.replace(/\r\n/g, "\n").trimEnd();
        const newDisplay = newText.replace(/\r\n/g, "\n").trimEnd();
        const body = `${pathLabel}\n${summary}\n\n--- previous ---\n${oldDisplay}\n\n--- proposed ---\n${newDisplay}`;
        return clipToolDisplayText(body);
    }
    if (piece.type === "terminal") {
        const id = piece.terminalId.trim();
        return id.length > 0 ? `[Terminal ${id}]` : "[Terminal]";
    }
    if (piece.type === "content") {
        return formatContentBlockForTool(piece.content);
    }
    return undefined;
}

function formatRawToolOutput(raw: unknown): string | undefined {
    if (raw === undefined || raw === null) {
        return undefined;
    }
    if (typeof raw === "string") {
        const t = raw.trim();
        return t.length > 0 ? clipToolDisplayText(t) : undefined;
    }
    if (typeof raw === "object") {
        const record = raw as Record<string, unknown>;
        if (typeof record.content === "string") {
            const t = record.content.trim();
            return t.length > 0 ? clipToolDisplayText(t) : undefined;
        }
        if (typeof record.stdout === "string" || typeof record.stderr === "string") {
            let combined = "";
            if (typeof record.exitCode === "number") {
                combined += `exit ${record.exitCode}\n`;
            }
            if (typeof record.stdout === "string" && record.stdout.length > 0) {
                combined += record.stdout;
            }
            if (typeof record.stderr === "string" && record.stderr.length > 0) {
                if (combined.length > 0 && !combined.endsWith("\n")) {
                    combined += "\n";
                }
                combined += record.stderr;
            }
            const t = combined.trim();
            return t.length > 0 ? clipToolDisplayText(t) : undefined;
        }
        if (
            typeof record.totalMatches === "number" ||
            typeof record.totalFiles === "number" ||
            typeof record.resultCount === "number"
        ) {
            const parts: string[] = [];
            if (typeof record.totalMatches === "number") {
                parts.push(`${record.totalMatches} match(es)`);
            }
            if (typeof record.totalFiles === "number") {
                parts.push(`${record.totalFiles} file(s)`);
            }
            if (typeof record.resultCount === "number") {
                parts.push(`${record.resultCount} result(s)`);
            }
            if (typeof record.truncated === "boolean") {
                parts.push(record.truncated ? "truncated" : "complete");
            }
            return parts.join(", ");
        }
        try {
            return clipToolDisplayText(JSON.stringify(raw, null, 2));
        } catch {
            return clipToolDisplayText(String(raw));
        }
    }
    return clipToolDisplayText(String(raw));
}

function toolCallUpdateToDisplayText(update: acp.ToolCallUpdate): string | undefined {
    const segments: string[] = [];
    if (update.content !== undefined && update.content !== null && update.content.length > 0) {
        for (const piece of update.content) {
            const segment = formatToolCallContentPiece(piece);
            if (segment !== undefined && segment.trim().length > 0) {
                segments.push(segment.trim());
            }
        }
    }
    if (segments.length > 0) {
        return clipToolDisplayText(segments.join("\n\n"));
    }
    return formatRawToolOutput(update.rawOutput);
}

function firstToolCallTextPreview(call: acp.ToolCall): string | undefined {
    if (!call.content || call.content.length === 0) {
        return undefined;
    }
    for (const block of call.content) {
        if (block.type === "content" && block.content.type === "text") {
            const t = block.content.text.trim();
            if (t.length > 0) {
                return t;
            }
        }
    }
    return undefined;
}

function formatToolRawInput(raw: unknown): string | undefined {
    if (raw === undefined || raw === null) {
        return undefined;
    }
    if (typeof raw === "string") {
        const t = raw.trim();
        return t.length > 0 ? t : undefined;
    }
    if (typeof raw === "object" && !Array.isArray(raw) && Object.keys(raw as object).length === 0) {
        return undefined;
    }
    try {
        const s = JSON.stringify(raw);
        return s !== undefined && s !== "{}" && s !== "[]" ? s : undefined;
    } catch {
        return String(raw);
    }
}

/** Tracks tool kinds from `tool_call` so `tool_call_update` can classify sparse completions (for example read tools with only `rawOutput.content`). */
export type ToolCallKindTracking = {
    kindByToolId: Map<string, string | undefined>;
};

/** Creates a fresh map for one prompt turn (tool IDs are unique per session but clearing each turn avoids unbounded growth). */
export function createToolCallKindTracking(): ToolCallKindTracking {
    return { kindByToolId: new Map() };
}

/**
 * Derives a subtitle for the tool row when a `tool_call_update` adds paths the initial `tool_call` omitted (common with Cursor CLI: empty `rawInput` on pending).
 */
export function toolCallUpdateSubtitleHint(
    update: acp.ToolCallUpdate,
    options?: { pendingKind?: string }
): string | undefined {
    if (update.locations && update.locations.length > 0) {
        const locPath = update.locations[0]!.path.trim();
        if (locPath.length > 0) {
            return locPath;
        }
    }
    if (update.content && update.content.length > 0) {
        for (const block of update.content) {
            if (block.type === "diff") {
                const pathLabel = block.path.trim();
                if (pathLabel.length > 0) {
                    return pathLabel;
                }
            }
        }
    }
    const fromRawOutputPath = pathHintFromStructuredUnknown(update.rawOutput);
    if (fromRawOutputPath !== undefined) {
        return formatSubtitlePathForKind(fromRawOutputPath, update, options?.pendingKind);
    }
    const fromRawInputPath = pathHintFromStructuredUnknown(update.rawInput);
    if (fromRawInputPath !== undefined) {
        return formatSubtitlePathForKind(fromRawInputPath, update, options?.pendingKind);
    }
    const rawInputText = formatToolRawInput(update.rawInput);
    if (rawInputText !== undefined && rawInputText.trim().length > 0) {
        const fromJsonPath = pathHintFromJsonishRawInput(rawInputText);
        if (fromJsonPath !== undefined) {
            return formatSubtitlePathForKind(fromJsonPath, update, options?.pendingKind);
        }
    }
    return undefined;
}

function pathHintFromStructuredUnknown(raw: unknown): string | undefined {
    const direct = pathHintFromPlainObject(raw);
    if (direct !== undefined) {
        return direct;
    }
    if (raw !== null && typeof raw === "object" && !Array.isArray(raw)) {
        const record = raw as Record<string, unknown>;
        const nested = record["_meta"];
        if (nested !== null && typeof nested === "object" && !Array.isArray(nested)) {
            return pathHintFromPlainObject(nested);
        }
    }
    return undefined;
}

function pathHintFromPlainObject(raw: unknown): string | undefined {
    if (raw === null || typeof raw !== "object" || Array.isArray(raw)) {
        return undefined;
    }
    const record = raw as Record<string, unknown>;
    for (const key of ["path", "filePath", "relativePath", "file", "target"] as const) {
        const value = record[key];
        if (typeof value === "string") {
            const trimmed = value.trim();
            if (trimmed.length > 0) {
                return trimmed;
            }
        }
    }
    return undefined;
}

function pathHintFromJsonishRawInput(text: string): string | undefined {
    const trimmed = text.trim();
    if (!trimmed.startsWith("{")) {
        return undefined;
    }
    try {
        const parsed = JSON.parse(trimmed) as unknown;
        return pathHintFromPlainObject(parsed);
    } catch {
        return undefined;
    }
}

function effectiveToolKindForUpdate(update: acp.ToolCallUpdate, pendingKind: string | undefined): string | undefined {
    if (update.kind !== undefined && update.kind !== null && String(update.kind).length > 0) {
        return update.kind;
    }
    return pendingKind;
}

function formatSubtitlePathForKind(
    pathHint: string,
    update: acp.ToolCallUpdate,
    pendingKind: string | undefined
): string | undefined {
    const kind = effectiveToolKindForUpdate(update, pendingKind);
    const status = update.status ?? "completed";
    if (kind === "read" && status === "completed") {
        return fileNameFromPath(pathHint);
    }
    return pathHint;
}

function fileNameFromPath(pathText: string): string {
    const trimmed = pathText.trim();
    const normalized = trimmed.replace(/\\/g, "/");
    const slash = normalized.lastIndexOf("/");
    if (slash >= 0 && slash < normalized.length - 1) {
        return normalized.slice(slash + 1);
    }
    return trimmed;
}

/**
 * Builds the dim subtitle line for a tool call (paths, arguments, or inline text from the agent).
 */
export function toolCallSubtitleFromToolCall(call: acp.ToolCall): string | undefined {
    const fromContent = firstToolCallTextPreview(call);
    if (fromContent !== undefined) {
        return fromContent;
    }
    if (call.locations && call.locations.length > 0) {
        const locPath = call.locations[0]!.path.trim();
        if (locPath.length > 0) {
            return locPath;
        }
    }
    return formatToolRawInput(call.rawInput);
}

/**
 * Maps a single ACP session/update payload to zero or more webview protocol messages.
 */
export function sessionUpdateToWebviewMessages(
    update: acp.SessionUpdate,
    toolKindTracking?: ToolCallKindTracking
): ExtensionToWebviewMessage[] {
    switch (update.sessionUpdate) {
        case "agent_message_chunk": {
            const block = update.content;
            if (block.type === "text") {
                return [{ type: "appendAgentText", text: block.text }];
            }
            return [];
        }
        case "tool_call": {
            toolKindTracking?.kindByToolId.set(update.toolCallId, update.kind);
            const subtitle = toolCallSubtitleFromToolCall(update);
            return [
                {
                    type: "appendToolCall",
                    toolCallId: update.toolCallId,
                    title: update.title,
                    kind: update.kind,
                    status: update.status ?? undefined,
                    ...(subtitle !== undefined ? { subtitle } : {}),
                },
            ];
        }
        case "tool_call_update": {
            const contentText = toolCallUpdateToDisplayText(update);
            const pendingKind = toolKindTracking?.kindByToolId.get(update.toolCallId);
            const subtitleHint = toolCallUpdateSubtitleHint(update, { pendingKind });
            return [
                {
                    type: "updateToolCall",
                    toolCallId: update.toolCallId,
                    status: update.status ?? "completed",
                    content: contentText,
                    ...(subtitleHint !== undefined ? { subtitle: subtitleHint } : {}),
                },
            ];
        }
        case "plan":
            return [
                {
                    type: "appendPlan",
                    entries: update.entries.map((e) => ({
                        content: e.content,
                        status: e.status,
                        priority: e.priority,
                    })),
                },
            ];
        case "agent_thought_chunk":
        case "user_message_chunk":
        default:
            return [];
    }
}
