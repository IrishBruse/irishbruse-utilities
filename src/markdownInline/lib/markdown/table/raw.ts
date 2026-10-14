import type { CursorContext, Scope, TextRange } from "../../document/types";

function selectionBounds(cursor: CursorContext): { from: number; to: number } {
    return {
        from: Math.min(cursor.selectionFrom, cursor.selectionTo),
        to: Math.max(cursor.selectionFrom, cursor.selectionTo),
    };
}

function rangesOverlap(start: number, end: number, lineStart: number, lineEnd: number): boolean {
    return start < lineEnd && end > lineStart;
}

function oneBreakBefore(scope: TextRange, cursor: CursorContext): boolean {
    const { from, to } = selectionBounds(cursor);
    if (from !== to) {
        return false;
    }
    return scope.start - cursor.lineEnd === cursor.eolLength;
}

export function tableShowsRaw(scope: Scope, cursor: CursorContext): boolean {
    const { from, to } = selectionBounds(cursor);
    const overlaps =
        from === to
            ? from >= scope.start && from < scope.end
            : from < scope.end && to > scope.start;
    return (
        overlaps ||
        rangesOverlap(scope.start, scope.end, cursor.lineStart, cursor.lineEnd) ||
        oneBreakBefore(scope, cursor)
    );
}
