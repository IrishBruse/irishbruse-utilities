import type { CursorContext, TextRange } from "../../../document/types";

function selectionBounds(cursor: CursorContext): { from: number; to: number } {
    return {
        from: Math.min(cursor.selectionFrom, cursor.selectionTo),
        to: Math.max(cursor.selectionFrom, cursor.selectionTo),
    };
}

export function listMarkerIsRawWhenTheCaretIsOnTheDash(
    range: TextRange,
    cursor: CursorContext,
): boolean {
    const { from, to } = selectionBounds(cursor);
    if (from === to) {
        return from >= range.start && from <= range.end;
    }
    return from < range.end && to > range.start;
}
