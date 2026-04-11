/**
 * ACP session shapes used by IB Chat: `session/new` model lists align with
 * `webview/ib-chat-standalone/mock/readme.ndjson`. Re-exports protocol types for convenience.
 */
export type {
    ModelId,
    ModelInfo,
    NewSessionResponse,
    SessionModelState,
    SetSessionModelRequest,
    SetSessionModelResponse,
} from "@agentclientprotocol/sdk";
export type { IbChatSessionModelSelection } from "./ibChatSessionModels";
export { sessionModelStateToIbChatSelection } from "./ibChatSessionModels";
export { parseSessionModelsFromReadmeNdjson } from "./readmeSessionNew";
