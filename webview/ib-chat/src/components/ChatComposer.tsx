import { useMemo, type KeyboardEvent, type ReactElement } from "react";
import "./ChatComposer.css";
import type { IbChatSessionModelSelection } from "../../../../src/chat/acp/agentSession/ibChatSessionModels";
import type { IbChatSlashCommand } from "../../../../src/chat/protocol/ibChatProtocol";
import type { AcpAgentSelectionState } from "../chatReducer";

export type ChatComposerProps = {
    activityLabel: string | null;
    acpAgentSelection: AcpAgentSelectionState | null;
    modelSelection: IbChatSessionModelSelection | null;
    promptInFlight: boolean;
    /** When set, blocks the textarea (e.g. pending permission dialog). */
    inputBlocked: boolean;
    slashCommands: IbChatSlashCommand[];
    draft: string;
    onDraftChange: (value: string) => void;
    onPickSessionAgent: (agentName: string) => void;
    onPickSessionModel: (modelId: string) => void;
    onSubmit: () => void;
    onCancel: () => void;
    onKeyDown: (event: KeyboardEvent<HTMLTextAreaElement>) => void;
    workspaceText: string;
};

/**
 * Activity hint, optional agent and model pickers, message input, and send/cancel actions.
 */
export function ChatComposer({
    activityLabel,
    acpAgentSelection,
    modelSelection,
    promptInFlight,
    inputBlocked,
    slashCommands,
    draft,
    onDraftChange,
    onPickSessionAgent,
    onPickSessionModel,
    onSubmit,
    onCancel,
    onKeyDown,
    workspaceText,
}: ChatComposerProps): ReactElement {
    const textareaDisabled = promptInFlight || inputBlocked;
    const slashQuery = useMemo(() => {
        const line = draft.split("\n")[0] ?? "";
        const match = line.match(/^\/([\w-]*)$/);
        if (match === null || slashCommands.length === 0) {
            return null;
        }
        return match[1] ?? "";
    }, [draft, slashCommands]);
    const slashMatches = useMemo(() => {
        if (slashQuery === null) {
            return [];
        }
        const q = slashQuery.toLowerCase();
        return slashCommands.filter((c) => c.name.toLowerCase().startsWith(q)).slice(0, 12);
    }, [slashQuery, slashCommands]);
    const showSlashMenu = slashMatches.length > 0 && slashQuery !== null;
    const showAgentPicker = acpAgentSelection !== null && acpAgentSelection.availableNames.length > 0;
    const showModelPicker = modelSelection !== null && modelSelection.availableModels.length > 0;
    const showTopBar = (activityLabel !== null && activityLabel.length > 0) || showAgentPicker || showModelPicker;

    return (
        <footer className="composer-frame">
            {showTopBar ? (
                <div className="composer-top-bar">
                    <div
                        className={
                            activityLabel !== null && activityLabel.length > 0
                                ? "composer-activity composer-activity--inflight"
                                : "composer-activity"
                        }
                        role="status"
                        aria-live="polite"
                    >
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
                                disabled={textareaDisabled}
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
                                disabled={textareaDisabled}
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
            <div className="composer-input-wrap">
                {showSlashMenu ? (
                    <div className="composer-slash-menu" role="listbox" aria-label="Slash commands">
                        {slashMatches.map((cmd) => (
                            <button
                                key={cmd.name}
                                type="button"
                                role="option"
                                className="composer-slash-item"
                                onClick={() => {
                                    onDraftChange(`/${cmd.name} `);
                                }}
                            >
                                <span className="composer-slash-name">/{cmd.name}</span>
                                <span className="composer-slash-desc">{cmd.description}</span>
                            </button>
                        ))}
                    </div>
                ) : null}
                <textarea
                    className="composer-input"
                    placeholder={"Describe a task for the agent to do in\n" + workspaceText}
                    aria-label="Agent input"
                    title="Enter to send. Shift+Enter for newline. Arrow up and down for prompt history."
                    rows={2}
                    value={draft}
                    disabled={textareaDisabled}
                    onChange={(e) => onDraftChange(e.target.value)}
                    onKeyDown={onKeyDown}
                />
            </div>
            <div className="composer-footer">
                <span className="composer-footer-hint-left">/ commands · @ files</span>
                <button type="button" className="composer-cancel" disabled={!promptInFlight} onClick={() => onCancel()}>
                    Cancel
                </button>
                <button type="button" className="composer-send" disabled={textareaDisabled} onClick={() => onSubmit()}>
                    Send
                </button>
            </div>
        </footer>
    );
}
