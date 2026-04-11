import { type ReactElement } from "react";
import type { ToolCallStatus } from "../../../../src/chat/protocol/ibChatProtocol";
import type { TraceToolItem } from "../chatReducer";

function ToolCallStatusGlyph({ status }: { status: ToolCallStatus }): ReactElement {
    if (status === "in_progress" || status === "pending") {
        return (
            <span
                className="tool-call-terminal-status tool-call-terminal-status--in-progress"
                aria-hidden="true"
            />
        );
    }
    if (status === "completed") {
        return (
            <span
                className="tool-call-terminal-status tool-call-terminal-status--completed"
                aria-hidden="true"
            />
        );
    }
    return (
        <span className="tool-call-terminal-status tool-call-terminal-status--failed" aria-hidden="true">
            {"\u2715"}
        </span>
    );
}

/**
 * Renders a tool invocation as a compact integrated-terminal style block (prompt line + optional output).
 */
export function ToolCallBlock({ item }: { item: TraceToolItem }): ReactElement {
    const kindHidden = item.kind === undefined || item.kind.length === 0;
    const showOutput =
        item.detailVisible && item.content !== undefined && item.content.trim().length > 0;
    const subtitle =
        item.subtitle !== undefined && item.subtitle.trim().length > 0 ? item.subtitle.trim() : null;
    return (
        <div
            className="tool-call-terminal"
            data-tool-id={item.toolCallId}
            data-status={item.status}
            role="status"
            aria-label="Tool use"
        >
            <div className="tool-call-terminal-line">
                <span className="tool-call-terminal-prompt" aria-hidden="true">
                    {"\u2B22"}
                </span>
                <ToolCallStatusGlyph status={item.status} />
                <span className="tool-call-terminal-title">{item.title}</span>
                {kindHidden ? null : <span className="tool-call-terminal-kind">[{item.kind}]</span>}
            </div>
            {subtitle !== null ? <div className="tool-call-terminal-subtitle">{subtitle}</div> : null}
            {showOutput ? <pre className="tool-call-terminal-pre">{item.content}</pre> : null}
        </div>
    );
}
