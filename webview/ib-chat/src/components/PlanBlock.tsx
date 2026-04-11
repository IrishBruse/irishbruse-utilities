import type { ReactElement } from "react";
import "./PlanBlock.css";
import type { PlanEntry } from "../../../../src/chat/protocol/ibChatProtocol";

/**
 * Renders an ACP agent plan as a titled list of status rows.
 */
export function PlanBlock({ entries }: { entries: PlanEntry[] }): ReactElement {
    return (
        <div className="agent-plan" aria-label="Agent plan">
            <div className="agent-plan-title">Plan</div>
            {entries.map((e, i) => (
                <div
                    key={i}
                    className="agent-plan-row"
                    title={e.priority !== undefined ? `priority: ${e.priority}` : undefined}
                >
                    <span className="agent-plan-status">{e.status}</span>
                    <span className="agent-plan-content">{e.content}</span>
                </div>
            ))}
        </div>
    );
}
