import { type ReactElement } from "react";
import "./ToolCallBlock.css";
import type { ToolCallStatus } from "../../../../src/chat/protocol/ibChatProtocol";
import type { TraceToolItem } from "../chatReducer";

const collapsiblePreviewLineCount = 3;

const collapsibleDiffPreviewRowCount = 6;

function toolKindUsesCollapsiblePreview(kind: string | undefined): boolean {
    return kind === "read" || kind === "execute";
}

function collapsibleRegionAriaLabel(kind: string | undefined, expandAll: boolean): string {
    const tail = expandAll ? "all long outputs expanded; press Ctrl+O or ⌘O to collapse all" : "truncated; press Ctrl+O or ⌘O to expand all";
    if (kind === "read") {
        return `File preview, ${tail}`;
    }
    if (kind === "execute") {
        return `Terminal output, ${tail}`;
    }
    return `Tool output, ${tail}`;
}

function collapsibleDiffAriaLabel(expandAll: boolean): string {
    const tail = expandAll ? "full diff; press Ctrl+O or ⌘O to collapse long diffs" : "truncated; press Ctrl+O or ⌘O to expand all long outputs";
    return `File diff, ${tail}`;
}

function collapsibleHintText(expandAll: boolean): string {
    return expandAll
        ? "Press Ctrl+O or ⌘O to collapse all long outputs."
        : "Press Ctrl+O or ⌘O to expand all long outputs.";
}

function ToolCallStatusGlyph({ status }: { status: ToolCallStatus }): ReactElement {
    if (status === "in_progress" || status === "pending") {
        return <span className="tool-call-terminal-status tool-call-terminal-status--in-progress" aria-hidden="true" />;
    }
    if (status === "completed") {
        return <span className="tool-call-terminal-status tool-call-terminal-status--completed" aria-hidden="true" />;
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
export function ToolCallBlock({
    item,
    expandAllToolOutputs,
}: {
    item: TraceToolItem;
    expandAllToolOutputs: boolean;
}): ReactElement {
    const kindHidden = item.kind === undefined || item.kind.length === 0;
    const hasDiff = item.diffRows !== undefined && item.diffRows.length > 0;
    const showOutput =
        item.detailVisible &&
        (hasDiff || (item.content !== undefined && item.content.trim().length > 0));
    const subtitle = item.subtitle !== undefined && item.subtitle.trim().length > 0 ? item.subtitle.trim() : null;
    const contentText = item.content ?? "";
    const contentLines = contentText.split(/\r?\n/);
    const outputCollapsible =
        !hasDiff &&
        showOutput &&
        toolKindUsesCollapsiblePreview(item.kind) &&
        contentLines.length > collapsiblePreviewLineCount;
    const displayedOutput =
        outputCollapsible && !expandAllToolOutputs
            ? contentLines.slice(0, collapsiblePreviewLineCount).join("\n")
            : contentText;
    const diffRows = item.diffRows;
    const diffCollapsible =
        hasDiff &&
        diffRows !== undefined &&
        diffRows.length > collapsibleDiffPreviewRowCount;
    const displayedDiffRows =
        diffCollapsible && !expandAllToolOutputs
            ? diffRows.slice(0, collapsibleDiffPreviewRowCount)
            : diffRows ?? [];

    return (
        <div
            className="tool-call-terminal"
            data-tool-id={item.toolCallId}
            data-status={item.status}
            role="status"
            aria-label="Tool use"
        >
            <div className="tool-call-terminal-line">
                <ToolCallStatusGlyph status={item.status} />
                <span className="tool-call-terminal-title">{item.title}</span>
                {kindHidden ? null : <span className="tool-call-terminal-kind">[{item.kind}]</span>}
            </div>
            {subtitle !== null ? <div className="tool-call-terminal-subtitle">{subtitle}</div> : null}
            {showOutput && hasDiff ? (
                diffCollapsible && !expandAllToolOutputs ? (
                    <div
                        className="tool-call-collapsible-output"
                        role="group"
                        aria-expanded={expandAllToolOutputs}
                        aria-label={collapsibleDiffAriaLabel(expandAllToolOutputs)}
                    >
                        <div className="tool-call-diff" role="group" aria-label="File diff preview">
                            {displayedDiffRows.map((row, rowIndex) => (
                                <div
                                    key={rowIndex}
                                    className={
                                        row.kind === "removed"
                                            ? "tool-call-diff-line tool-call-diff-line--removed"
                                            : row.kind === "added"
                                              ? "tool-call-diff-line tool-call-diff-line--added"
                                              : "tool-call-diff-line tool-call-diff-line--context"
                                    }
                                >
                                    <span className="tool-call-diff-prefix" aria-hidden="true">
                                        {row.kind === "removed" ? "-" : row.kind === "added" ? "+" : " "}
                                    </span>
                                    <span className="tool-call-diff-text">{row.text}</span>
                                </div>
                            ))}
                        </div>
                        <p className="tool-call-collapsible-hint">{collapsibleHintText(expandAllToolOutputs)}</p>
                    </div>
                ) : (
                    <div className="tool-call-diff" role="group" aria-label="File diff">
                        {(diffRows ?? []).map((row, rowIndex) => (
                            <div
                                key={rowIndex}
                                className={
                                    row.kind === "removed"
                                        ? "tool-call-diff-line tool-call-diff-line--removed"
                                        : row.kind === "added"
                                          ? "tool-call-diff-line tool-call-diff-line--added"
                                          : "tool-call-diff-line tool-call-diff-line--context"
                                }
                            >
                                <span className="tool-call-diff-prefix" aria-hidden="true">
                                    {row.kind === "removed" ? "-" : row.kind === "added" ? "+" : " "}
                                </span>
                                <span className="tool-call-diff-text">{row.text}</span>
                            </div>
                        ))}
                    </div>
                )
            ) : showOutput ? (
                outputCollapsible ? (
                    <div
                        className="tool-call-collapsible-output"
                        role="group"
                        aria-expanded={expandAllToolOutputs}
                        aria-label={collapsibleRegionAriaLabel(item.kind, expandAllToolOutputs)}
                    >
                        <pre className="tool-call-terminal-pre tool-call-terminal-pre--collapsible">{displayedOutput}</pre>
                        <p className="tool-call-collapsible-hint">{collapsibleHintText(expandAllToolOutputs)}</p>
                    </div>
                ) : (
                    <pre className="tool-call-terminal-pre">{contentText}</pre>
                )
            ) : null}
        </div>
    );
}
