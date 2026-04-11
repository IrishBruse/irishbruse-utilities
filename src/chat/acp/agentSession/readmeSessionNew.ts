import type { SessionModelState } from "@agentclientprotocol/sdk";
import type { IbChatSessionModelSelection } from "./ibChatSessionModels";

/**
 * Extracts `result.models` from a captured ACP NDJSON log such as
 * `webview/ib-chat-standalone/mock/readme.ndjson` (see the `session/new` response line).
 */
export function parseSessionModelsFromReadmeNdjson(text: string): IbChatSessionModelSelection | null {
    for (const line of text.split("\n")) {
        const trimmed = line.trim();
        if (trimmed.length === 0) {
            continue;
        }
        let row: unknown;
        try {
            row = JSON.parse(trimmed) as unknown;
        } catch {
            continue;
        }
        if (row === null || typeof row !== "object") {
            continue;
        }
        const record = row as Record<string, unknown>;
        const result = record["result"];
        if (result === null || typeof result !== "object") {
            continue;
        }
        const resultRecord = result as Record<string, unknown>;
        const models = resultRecord["models"];
        if (models === null || typeof models !== "object") {
            continue;
        }
        const ms = models as SessionModelState;
        if (!Array.isArray(ms.availableModels) || typeof ms.currentModelId !== "string") {
            continue;
        }
        return {
            currentModelId: ms.currentModelId,
            availableModels: ms.availableModels.map((m) => ({
                modelId: m.modelId,
                name: m.name,
            })),
        };
    }
    return null;
}
