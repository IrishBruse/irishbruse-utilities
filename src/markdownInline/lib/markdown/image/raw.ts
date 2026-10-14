import type { CursorContext, TextRange } from "../../document/types";

function spansOverlap(start: number, end: number, otherStart: number, otherEnd: number): boolean {
    return start < otherEnd && end > otherStart;
}

function selectionOverlaps(scope: TextRange, cursor: CursorContext): boolean {
    const from = Math.min(cursor.selectionFrom, cursor.selectionTo);
    const to = Math.max(cursor.selectionFrom, cursor.selectionTo);
    if (from === to) {
        return from > scope.start && from < scope.end;
    }
    return from < scope.end && to > scope.start;
}

export function imageShowsRaw(scope: TextRange, cursor: CursorContext): boolean {
    return (
        selectionOverlaps(scope, cursor) ||
        spansOverlap(scope.start, scope.end, cursor.lineStart, cursor.lineEnd)
    );
}
