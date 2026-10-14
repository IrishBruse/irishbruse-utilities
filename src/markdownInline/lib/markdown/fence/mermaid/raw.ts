import type { CursorContext, Scope } from "../../../document/types";

function selectionOverlaps(scope: Scope, cursor: CursorContext): boolean {
    const from = Math.min(cursor.selectionFrom, cursor.selectionTo);
    const to = Math.max(cursor.selectionFrom, cursor.selectionTo);
    if (from === to) {
        return from > scope.start && from < scope.end;
    }
    return from < scope.end && to > scope.start;
}

export function isMermaidCodeBlock(language: string | undefined): boolean {
    return (language ?? "").trim().toLowerCase() === "mermaid";
}

export function mermaidShowsPreviewZone(
    scope: Scope,
    cursor: CursorContext,
    findHit: boolean,
): boolean {
    if (scope.kind !== "codeBlock" || !isMermaidCodeBlock(scope.language)) {
        return false;
    }
    if (findHit || selectionOverlaps(scope, cursor)) {
        return false;
    }
    return true;
}
