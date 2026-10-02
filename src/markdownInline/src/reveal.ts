import type { CursorContext, Scope, TextRange } from "./types";
import { markerVisibility, selectionOverlaps, showsFormattedContent, type MarkerLineContext } from "./visibility";

export type RevealAction = "raw" | "ghost" | "hidden" | "zone" | "occupy";

export function revealMarker(input: {
    scope: Scope;
    marker: TextRange;
    cursor: CursorContext;
    markerLine: MarkerLineContext;
    findHit: boolean;
    frontMatterEnd: number | undefined;
    singleLine: boolean;
}): RevealAction {
    const visibility = markerVisibility(input.scope, input.marker, input.cursor, input.markerLine);
    if (input.findHit) {
        if (visibility === "hidden") {
            return "raw";
        }
        return visibility;
    }
    if (visibility !== "hidden") {
        return visibility;
    }
    if (input.scope.kind === "table") {
        return "zone";
    }
    if (input.scope.kind === "thematicBreak" && input.frontMatterEnd !== undefined && input.marker.start < input.frontMatterEnd) {
        return "occupy";
    }
    if ((input.scope.kind === "image" || input.scope.kind === "thematicBreak") && input.singleLine) {
        return "zone";
    }
    return "hidden";
}

export function showFormatted(scope: Scope, cursor: CursorContext, findHit: boolean): boolean {
    return showsFormattedContent(scope, cursor) && !findHit;
}

export function revealMermaid(scope: Scope, cursor: CursorContext, findHit: boolean): "zone" | "raw" {
    if (findHit || selectionOverlaps(scope, cursor)) {
        return "raw";
    }
    return "zone";
}
