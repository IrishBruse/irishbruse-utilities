import type { ModelInfo, SessionModelState } from "@agentclientprotocol/sdk";

/**
 * Serializable model list for the IB Chat webview. Matches `models` on `session/new` in
 * `webview/ib-chat-standalone/mock/readme.ndjson`.
 */
export type IbChatSessionModelSelection = {
    currentModelId: string;
    availableModels: Array<Pick<ModelInfo, "modelId" | "name">>;
};

/**
 * Converts agent `SessionModelState` to the webview payload shape.
 */
export function sessionModelStateToIbChatSelection(state: SessionModelState): IbChatSessionModelSelection {
    return {
        currentModelId: state.currentModelId,
        availableModels: state.availableModels.map((m) => ({ modelId: m.modelId, name: m.name })),
    };
}
