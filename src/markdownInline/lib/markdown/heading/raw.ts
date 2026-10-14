import type { CursorContext, Scope, TextRange } from "../../document/types";
import { selectionOverlaps } from "../../visibility";
import { headingLevel } from "./style";

function rangesOverlap(start: number, end: number, lineStart: number, lineEnd: number): boolean {
    return start < lineEnd && end > lineStart;
}

export function headingShowsRaw(scope: Scope, cursor: CursorContext): boolean {
    return (
        selectionOverlaps(scope, cursor) ||
        rangesOverlap(scope.start, scope.end, cursor.lineStart, cursor.lineEnd)
    );
}

export function rawHeadingClass(scope: Scope): string {
    return `inline-md-h${headingLevel(scope)}`;
}

export function rawHeadingBounds(text: string, scope: Scope): TextRange {
    let end = scope.end;
    if (end > scope.start && text[end - 1] === "\n") {
        end -= 1;
        if (end > scope.start && text[end - 1] === "\r") {
            end -= 1;
        }
    }
    return { start: scope.start, end };
}
