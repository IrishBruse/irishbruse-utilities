export interface ParseNeed {
    readonly startLine: number;
    readonly endLine: number;
    readonly startOffset: number;
    readonly endOffset: number;
    readonly lineCount: number;
}

export interface ParseSpan {
    readonly startOffset: number;
    readonly endOffset: number;
}

function lineStarts(source: string): number[] {
    const starts = [0];
    for (let index = 0; index < source.length; index += 1) {
        if (source.charCodeAt(index) === 10) {
            starts.push(index + 1);
        }
    }
    return starts;
}

function lineCountOf(source: string, starts: readonly number[]): number {
    if (source.length === 0) {
        return 1;
    }
    const last = starts[starts.length - 1];
    if (last === source.length) {
        return Math.max(1, starts.length - 1);
    }
    return starts.length;
}

function lineText(source: string, starts: readonly number[], line: number): string {
    const start = starts[line - 1] ?? 0;
    let end = starts[line] ?? source.length;
    if (end > start && source.charCodeAt(end - 1) === 10) {
        end -= 1;
    }
    if (end > start && source.charCodeAt(end - 1) === 13) {
        end -= 1;
    }
    return source.slice(start, end);
}

function readFence(line: string): { char: string; size: number; closeOnly: boolean } | undefined {
    const match = /^( {0,3})(`{3,}|~{3,})(.*)$/.exec(line);
    if (!match) {
        return undefined;
    }
    const marker = match[2] ?? "";
    const rest = match[3] ?? "";
    const char = marker[0] ?? "";
    if (char === "`" && rest.includes("`")) {
        return undefined;
    }
    return { char, size: marker.length, closeOnly: rest.trim().length === 0 };
}

function openFenceLine(
    source: string,
    starts: readonly number[],
    throughLine: number,
): number | undefined {
    let open: { line: number; char: string; size: number } | undefined;
    for (let line = 1; line <= throughLine; line += 1) {
        const fence = readFence(lineText(source, starts, line));
        if (!fence) {
            continue;
        }
        if (open && fence.closeOnly && fence.char === open.char && fence.size >= open.size) {
            open = undefined;
            continue;
        }
        if (!open) {
            open = { line, char: fence.char, size: fence.size };
        }
    }
    return open?.line;
}

function isTableDelimiter(line: string): boolean {
    const text = line.trim();
    if (!text.includes("|")) {
        return false;
    }
    const cells = text.replace(/^\|/, "").replace(/\|$/, "").split("|");
    return cells.length > 0 && cells.every((cell) => /^\s*:?-{3,}:?\s*$/.test(cell));
}

function isTableLine(line: string): boolean {
    if (isTableDelimiter(line)) {
        return true;
    }
    const text = line.trim();
    return text.includes("|") && (text.startsWith("|") || text.endsWith("|"));
}

function isBlockStart(line: string): boolean {
    return (
        /^( {0,3})([-+*]|\d{1,9}[.)])([ \t]+)/.test(line) ||
        /^( {0,3}>)/.test(line) ||
        isTableLine(line)
    );
}

function isContinuation(line: string): boolean {
    return /^( {2,}|\t)\S/.test(line);
}

function expandStart(source: string, starts: readonly number[], startLine: number): number {
    let line = openFenceLine(source, starts, startLine - 1) ?? startLine;
    while (line > 1) {
        const previous = lineText(source, starts, line - 1);
        if (previous.trim().length === 0) {
            if (line > 2) {
                const before = lineText(source, starts, line - 2);
                if (isBlockStart(before) || isContinuation(before)) {
                    line -= 1;
                    continue;
                }
            }
            break;
        }
        if (isBlockStart(previous) || isContinuation(previous)) {
            line -= 1;
            continue;
        }
        break;
    }
    return line;
}

function expandEnd(
    source: string,
    starts: readonly number[],
    startLine: number,
    endLine: number,
    lastLine: number,
): number {
    let line = endLine;
    const fenceLine = openFenceLine(source, starts, line);
    if (fenceLine !== undefined && fenceLine >= startLine) {
        let open: { char: string; size: number } | undefined;
        for (let cursor = fenceLine; cursor <= line; cursor += 1) {
            const fence = readFence(lineText(source, starts, cursor));
            if (!fence) {
                continue;
            }
            if (open && fence.closeOnly && fence.char === open.char && fence.size >= open.size) {
                open = undefined;
                continue;
            }
            if (!open) {
                open = fence;
            }
        }
        if (open) {
            for (let cursor = line + 1; cursor <= lastLine; cursor += 1) {
                line = cursor;
                const fence = readFence(lineText(source, starts, cursor));
                if (fence?.closeOnly && fence.char === open.char && fence.size >= open.size) {
                    break;
                }
            }
        }
    }
    while (line < lastLine && isTableLine(lineText(source, starts, line + 1))) {
        line += 1;
    }
    return line;
}

export function blockSafeParseSpan(source: string, need: ParseNeed): ParseSpan {
    const starts = lineStarts(source);
    const lastLine = lineCountOf(source, starts);
    const startLine = expandStart(source, starts, Math.min(lastLine, Math.max(1, need.startLine)));
    const endLine = expandEnd(
        source,
        starts,
        startLine,
        Math.min(lastLine, Math.max(startLine, need.endLine)),
        lastLine,
    );
    const startOffset = starts[startLine - 1] ?? 0;
    const endOffset = starts[endLine] ?? source.length;
    return {
        startOffset,
        endOffset: Math.max(startOffset, Math.min(source.length, endOffset)),
    };
}
