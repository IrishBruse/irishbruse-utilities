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

function adjacentApproach(scope: TextRange, cursor: CursorContext): boolean {
    const { from, to } = selectionBounds(cursor);
    if (from !== to) {
        return false;
    }
    const gap = scope.start - cursor.lineEnd;
    return gap >= 1 && gap <= 2;
}

function oneBreakBefore(scope: TextRange, cursor: CursorContext): boolean {
    const { from, to } = selectionBounds(cursor);
    if (from !== to) {
        return false;
    }
    return scope.start - cursor.lineEnd === cursor.eolLength;
}

function blockReveal(scope: TextRange, cursor: CursorContext): boolean {
    return selectionOverlaps(scope, cursor)
        || rangesOverlap(scope.start, scope.end, cursor.lineStart, cursor.lineEnd)
        || adjacentApproach(scope, cursor);
}

export interface MarkerLineContext {
    readonly lineStart: number;
    readonly lineEnd: number;
}

function selectionCoversMarkerLine(marker: TextRange, cursor: CursorContext, markerLine: MarkerLineContext): boolean {
    const { from, to } = selectionBounds(cursor);
    if (from === to) {
        return false;
    }
    return rangesOverlap(marker.start, marker.end, markerLine.lineStart, markerLine.lineEnd)
        && rangesOverlap(markerLine.lineStart, markerLine.lineEnd, from, to);
}

export function markerVisibility(
    scope: Scope,
    marker: TextRange,
    cursor: CursorContext,
    markerLine: MarkerLineContext,
): MarkerVisibility {
    if (scope.kind === "heading") {
        return selectionOverlaps(scope, cursor) || rangesOverlap(scope.start, scope.end, cursor.lineStart, cursor.lineEnd)
            ? "raw"
            : "hidden";
    }
    if (scope.kind === "thematicBreak") {
        return selectionOverlaps(scope, cursor) || rangesOverlap(scope.start, scope.end, cursor.lineStart, cursor.lineEnd) ? "raw" : "hidden";
    }
    if (STRUCTURAL.has(scope.kind)) {
        return cursorOnRange(marker, cursor) || selectionCoversMarkerLine(marker, cursor, markerLine) ? "raw" : "hidden";
    }
    if (scope.kind === "image") {
        return blockReveal(scope, cursor) ? "raw" : "hidden";
    }
    if (scope.kind === "table") {
        const { from, to } = selectionBounds(cursor);
        const overlaps = from === to ? from >= scope.start && from < scope.end : from < scope.end && to > scope.start;
        return overlaps || rangesOverlap(scope.start, scope.end, cursor.lineStart, cursor.lineEnd) || oneBreakBefore(scope, cursor)
            ? "raw"
            : "hidden";
    }
    if (selectionOverlaps(scope, cursor)) {
        return "raw";
    }
    if (rangesOverlap(scope.start, scope.end, cursor.lineStart, cursor.lineEnd)) {
        return "ghost";
    }
    return "hidden";
}

export function showsFormattedContent(scope: Scope, cursor: CursorContext): boolean {
    switch (scope.kind) {
        case "heading":
            return !(
                selectionOverlaps(scope, cursor)
                || rangesOverlap(scope.start, scope.end, cursor.lineStart, cursor.lineEnd)
            );
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
