import type { ReactElement } from "react";
import "./TraceList.css";
import type { TraceItem } from "../chatReducer";
import { AgentMarkdown } from "./AgentMarkdown";
import { PlanBlock } from "./PlanBlock";
import { ToolCallBlock } from "./ToolCallBlock";

/**
 * Renders the conversation trace: user lines, streamed agent markdown, tool blocks, and plan blocks.
 */
export function TraceList({
    items,
    expandAllToolOutputs,
}: {
    items: TraceItem[];
    expandAllToolOutputs: boolean;
}): ReactElement {
    return (
        <>
            {items.map((item, index) => {
                if (item.type === "user") {
                    return (
                        <section key={index} className="user-prompt-bar" aria-label="User message">
                            {item.text}
                        </section>
                    );
                }
                if (item.type === "agent") {
                    return (
                        <div key={index} className="agent-response-stream">
                            <div className="agent-response-markdown" aria-label="Agent response">
                                <AgentMarkdown text={item.text} />
                            </div>
                        </div>
                    );
                }
                if (item.type === "tool") {
                    return (
                        <ToolCallBlock
                            key={item.toolCallId}
                            item={item}
                            expandAllToolOutputs={expandAllToolOutputs}
                        />
                    );
                }
                return <PlanBlock key={index} entries={item.entries} />;
            })}
        </>
    );
}
