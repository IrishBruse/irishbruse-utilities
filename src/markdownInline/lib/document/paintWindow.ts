export interface PaintLineSpan {
    readonly startLine: number;
    readonly endLine: number;
}

export const paintWindowMargin = 120;

export function paintLineSpan(
    visibleFirst: number,
    visibleLast: number,
    selectionStart: number | undefined,
    selectionEnd: number | undefined,
    lineCount: number,
    margin = paintWindowMargin,
): PaintLineSpan {
    let startLine = Math.max(1, visibleFirst - margin);
    let endLine = Math.min(lineCount, visibleLast + margin);
    if (selectionStart === undefined || selectionEnd === undefined) {
        return { startLine, endLine };
    }
    const selStart = Math.min(selectionStart, selectionEnd);
    const selEnd = Math.max(selectionStart, selectionEnd);
    if (selEnd < startLine || selStart > endLine || selEnd - selStart >= 400) {
        return { startLine, endLine };
    }
    startLine = Math.min(startLine, selStart);
    endLine = Math.max(endLine, selEnd);
    return { startLine, endLine };
}
