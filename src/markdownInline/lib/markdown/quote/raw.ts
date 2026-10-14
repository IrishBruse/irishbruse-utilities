import type { CursorContext, TextRange } from "../../document/types";

export function quoteMarkerShowsRaw(marker: TextRange, cursor: CursorContext): boolean {
    const from = Math.min(cursor.selectionFrom, cursor.selectionTo);
    const to = Math.max(cursor.selectionFrom, cursor.selectionTo);
    if (from === to) {
        return from >= marker.start && from < marker.end;
    }
    return from < marker.end && to > marker.start;
}
