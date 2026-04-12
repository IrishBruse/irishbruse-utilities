import type { KeyboardEvent, ReactElement } from "react";
import "./ChatComposer.css";
import type { IbChatSessionModelSelection } from "../../../../src/chat/acp/agentSession/ibChatSessionModels";
import type { AcpAgentSelectionState } from "../chatReducer";

export type ChatComposerProps = {
    activityLabel: string | null;
    acpAgentSelection: AcpAgentSelectionState | null;
    modelSelection: IbChatSessionModelSelection | null;
    promptInFlight: boolean;
    draft: string;
    onDraftChange: (value: string) => void;
    onPickSessionAgent: (agentName: string) => void;
    onPickSessionModel: (modelId: string) => void;
    onSubmit: () => void;
    onCancel: () => void;
    onKeyDown: (event: KeyboardEvent<HTMLTextAreaElement>) => void;
};

/**
 * Activity hint, optional agent and model pickers, message input, and send/cancel actions.
 */
export function ChatComposer({
    activityLabel,
    acpAgentSelection,
    modelSelection,
    promptInFlight,
    draft,
    onDraftChange,
    onPickSessionAgent,
    onPickSessionModel,
    onSubmit,
    onCancel,
    onKeyDown,
}: ChatComposerProps): ReactElement {
    const showAgentPicker = acpAgentSelection !== null && acpAgentSelection.availableNames.length > 0;
    const showModelPicker = modelSelection !== null && modelSelection.availableModels.length > 0;
    const showTopBar =
        (activityLabel !== null && activityLabel.length > 0) || showAgentPicker || showModelPicker;

    return (
        <footer className="composer-frame">
            {showTopBar ? (
                <div className="composer-top-bar">
                    <div className="composer-activity" role="status" aria-live="polite">
                        {activityLabel ?? ""}
                    </div>
                    <div className="composer-top-bar-right">
                        {showAgentPicker ? (
                            <label className="composer-inline-label" htmlFor="ib-chat-agent-select">
                                Agent
                            </label>
                        ) : null}
                        {showAgentPicker ? (
                            <select
                                id="ib-chat-agent-select"
                                className="composer-agent-select"
                                aria-label="Agent"
                                value={acpAgentSelection.currentName}
                                disabled={promptInFlight}
                                onChange={(e) => {
                                    onPickSessionAgent(e.target.value);
                                }}
                            >
                                {acpAgentSelection.availableNames.map((name) => (
                                    <option key={name} value={name}>
                                        {name}
                                    </option>
                                ))}
                            </select>
                        ) : null}
                        {showModelPicker ? (
                            <label className="composer-inline-label" htmlFor="ib-chat-model-select">
                                Model
                            </label>
                        ) : null}
                        {showModelPicker ? (
                            <select
                                id="ib-chat-model-select"
                                className="composer-model-select"
                                aria-label="Model"
                                value={modelSelection.currentModelId}
                                disabled={promptInFlight}
                                onChange={(e) => {
                                    onPickSessionModel(e.target.value);
                                }}
                            >
                                {modelSelection.availableModels.map((m) => (
                                    <option key={m.modelId} value={m.modelId}>
                                        {m.name}
                                    </option>
                                ))}
                            </select>
                        ) : null}
                    </div>
                </div>
            ) : null}
            <textarea
                className="composer-input"
                placeholder="Describe a task or reply to the agent…"
                aria-label="Agent input"
                rows={2}
                value={draft}
                disabled={promptInFlight}
                onChange={(e) => onDraftChange(e.target.value)}
                onKeyDown={onKeyDown}
            />
            <div className="composer-footer">
                <span className="composer-hint">Enter to send · Shift+Enter for newline</span>
                <button
                    type="button"
                    className="composer-cancel"
                    disabled={!promptInFlight}
                    onClick={() => onCancel()}
                >
                    Cancel
                </button>
                <button
                    type="button"
                    className="composer-send"
                    disabled={promptInFlight}
                    onClick={() => onSubmit()}
                >
                    Send
                </button>
            </div>
        </footer>
    );
}
