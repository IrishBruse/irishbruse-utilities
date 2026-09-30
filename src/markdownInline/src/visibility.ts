import type { CursorContext, MarkerVisibility, Scope, TextRange } from "./types";

const STRUCTURAL = new Set<Scope["kind"]>(["listMarker", "blockquoteMarker", "task"]);

function selectionBounds(cursor: CursorContext): { from: number; to: number } {
    return {
        from: Math.min(cursor.selectionFrom, cursor.selectionTo),
        to: Math.max(cursor.selectionFrom, cursor.selectionTo),
    };
}

function rangesOverlap(start: number, end: number, lineStart: number, lineEnd: number): boolean {
    return start < lineEnd && end > lineStart;
}

/** Collapsed carets count only when strictly inside the construct. */
export function selectionOverlaps(scope: TextRange, cursor: CursorContext): boolean {
    const { from, to } = selectionBounds(cursor);
    if (from === to) {
        return from > scope.start && from < scope.end;
    }
    return from < scope.end && to > scope.start;
}

function cursorOnRange(range: TextRange, cursor: CursorContext): boolean {
    const { from, to } = selectionBounds(cursor);
    if (from === to) {
        return from >= range.start && from < range.end;
    }
    return from < range.end && to > range.start;
}

/**
 * Rendered hides markers, ghost fades markers on the active line, and raw
 * shows them. Headings go raw for the whole line. List, quote, and task
 * markers stay hidden until the cursor is on the marker itself.
 */
export function markerVisibility(scope: Scope, marker: TextRange, cursor: CursorContext): MarkerVisibility {
    if (scope.kind === "heading" || scope.kind === "thematicBreak") {
        return rangesOverlap(scope.start, scope.end, cursor.lineStart, cursor.lineEnd) ? "raw" : "hidden";
    }
    if (STRUCTURAL.has(scope.kind)) {
        return cursorOnRange(marker, cursor) ? "raw" : "hidden";
    }
    if (scope.kind === "image") {
        return selectionOverlaps(scope, cursor) ? "raw" : "hidden";
    }
    if (scope.kind === "table") {
        const { from, to } = selectionBounds(cursor);
        const overlaps = from === to ? from >= scope.start && from < scope.end : from < scope.end && to > scope.start;
        return overlaps ? "raw" : "hidden";
    }
    if (selectionOverlaps(scope, cursor)) {
        return "raw";
    }
    if (rangesOverlap(scope.start, scope.end, cursor.lineStart, cursor.lineEnd)) {
        return "ghost";
    }
    return "hidden";
}

/** Whether the construct's content keeps its formatted style. */
export function showsFormattedContent(scope: Scope, cursor: CursorContext): boolean {
    switch (scope.kind) {
        case "heading":
            return !rangesOverlap(scope.start, scope.end, cursor.lineStart, cursor.lineEnd);
        case "codeBlock":
        case "blockquote":
            return true;
        case "image":
        case "table":
        case "thematicBreak":
        case "listMarker":
        case "blockquoteMarker":
        case "task":
            return false;
        default:
            return !selectionOverlaps(scope, cursor);
    }
}
