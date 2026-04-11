import type { KeyboardEvent, ReactElement } from "react";
import "./ChatComposer.css";
import type { IbChatSessionModelSelection } from "../../../../src/chat/acp/agentSession/ibChatSessionModels";

export type ChatComposerProps = {
    modelSelection: IbChatSessionModelSelection | null;
    promptInFlight: boolean;
    draft: string;
    onDraftChange: (value: string) => void;
    onPickSessionModel: (modelId: string) => void;
    onSubmit: () => void;
    onCancel: () => void;
    onKeyDown: (event: KeyboardEvent<HTMLTextAreaElement>) => void;
};

/**
 * Model picker (when session models exist), message input, and send/cancel actions.
 */
export function ChatComposer({
    modelSelection,
    promptInFlight,
    draft,
    onDraftChange,
    onPickSessionModel,
    onSubmit,
    onCancel,
    onKeyDown,
}: ChatComposerProps): ReactElement {
    return (
        <footer className="composer-frame">
            {modelSelection !== null && modelSelection.availableModels.length > 0 ? (
                <div className="composer-model-row">
                    <label className="composer-model-label" htmlFor="ib-chat-model-select">
                        Model
                    </label>
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
