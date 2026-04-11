import type { ReactElement } from "react";
import "./ChatHeader.css";

export type ChatHeaderProps = {
    agentVersionLabel: string | undefined;
    workspaceText: string;
    acpAgentName: string | undefined;
};

/**
 * Webview header: product title, workspace label, and optional ACP agent name.
 */
export function ChatHeader({ agentVersionLabel, workspaceText, acpAgentName }: ChatHeaderProps): ReactElement {
    return (
        <header className="agent-header">
            <div className="agent-title-line">
                IB Chat <span className="agent-version">{agentVersionLabel ?? ""}</span>
            </div>
            <div className="agent-meta-line" title={workspaceText}>
                {workspaceText}
            </div>
            {acpAgentName !== undefined && acpAgentName.length > 0 ? (
                <div className="agent-acp-name">ACP agent: {acpAgentName}</div>
            ) : null}
        </header>
    );
}
