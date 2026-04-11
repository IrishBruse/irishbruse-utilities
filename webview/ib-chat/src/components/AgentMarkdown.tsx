import "./AgentMarkdown.css";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import type { ReactElement } from "react";

export type AgentMarkdownProps = {
    /** Full assistant message text; updates as streaming chunks arrive. */
    text: string;
};

/**
 * Renders assistant markdown with GFM (tables, strikethrough, task lists). Re-parses on each text
 * update so streaming chunks render incrementally without a separate streaming parser.
 */
export function AgentMarkdown({ text }: AgentMarkdownProps): ReactElement {
    if (text.length === 0) {
        return <div className="agent-markdown agent-markdown-empty" aria-hidden="true" />;
    }
    return (
        <div className="agent-markdown">
            <ReactMarkdown remarkPlugins={[remarkGfm]}>{text}</ReactMarkdown>
        </div>
    );
}
