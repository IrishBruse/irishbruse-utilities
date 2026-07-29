import { Range } from "vscode";

export interface MarkdownMermaidFence {
    /** Zero-based line index of the opening fence. */
    openLine: number;
    /** Zero-based line index of the closing fence. */
    closeLine: number;
    /** Diagram source between fences (no trailing newline). */
    source: string;
    /** Range covering the `mermaid` language tag on the opening line. */
    languageTagRange: Range;
}

const OPEN_FENCE_RE = /^(\s*)(`{3,}|~{3,})\s*(mermaid)\b(.*)$/i;

function escapeRegExp(value: string): string {
    return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Finds ```mermaid fenced code blocks in markdown text.
 */
export function parseMarkdownMermaidFences(text: string): MarkdownMermaidFence[] {
    const lines = text.split(/\r?\n/);
    const fences: MarkdownMermaidFence[] = [];

    for (let lineIndex = 0; lineIndex < lines.length; lineIndex++) {
        const line = lines[lineIndex] ?? "";
        const openMatch = OPEN_FENCE_RE.exec(line);
        if (!openMatch) {
            continue;
        }

        const indent = openMatch[1] ?? "";
        const fenceMarker = openMatch[2] ?? "";
        const languageTag = openMatch[3] ?? "mermaid";
        const tagStart = line.toLowerCase().indexOf(languageTag.toLowerCase());
        const tagEnd = tagStart + languageTag.length;
        const languageTagRange = new Range(lineIndex, tagStart, lineIndex, tagEnd);

        const contentStartLine = lineIndex + 1;
        let closeLine = -1;
        const closeRe = new RegExp(`^${escapeRegExp(indent)}${escapeRegExp(fenceMarker)}\\s*$`);

        for (let scan = contentStartLine; scan < lines.length; scan++) {
            if (closeRe.test(lines[scan] ?? "")) {
                closeLine = scan;
                break;
            }
        }

        if (closeLine < 0) {
            continue;
        }

        const source = lines.slice(contentStartLine, closeLine).join("\n");
        fences.push({
            openLine: lineIndex,
            closeLine,
            source,
            languageTagRange,
        });

        lineIndex = closeLine;
    }

    return fences;
}

export function findMarkdownMermaidFenceAtOpenLine(
    text: string,
    openLine: number
): MarkdownMermaidFence | undefined {
    return parseMarkdownMermaidFences(text).find((fence) => fence.openLine === openLine);
}
