import type { CursorContext, Scope, TextRange } from "./document/types";
import { markerVisibility, selectionOverlaps, showsFormattedContent, type MarkerLineContext } from "./visibility";

export type RevealAction = "raw" | "ghost" | "hidden" | "zone" | "occupy";

export type RevealSurface =
    | { surface: "preview"; zone: boolean; occupy: boolean }
    | { surface: "raw"; ghost: boolean };

export type RevealInput = {
    scope: Scope;
    marker: TextRange;
    cursor: CursorContext;
    markerLine: MarkerLineContext;
    findHit: boolean;
    frontMatterEnd: number | undefined;
    singleLine: boolean;
};

function surfaceFor(action: RevealAction): RevealSurface {
    switch (action) {
        case "raw":
            return { surface: "raw", ghost: false };
        case "ghost":
            return { surface: "raw", ghost: true };
        case "hidden":
            return { surface: "preview", zone: false, occupy: false };
        case "zone":
            return { surface: "preview", zone: true, occupy: false };
        case "occupy":
            return { surface: "preview", zone: false, occupy: true };
    }
}

export function reveal(input: RevealInput): RevealSurface {
    return surfaceFor(revealMarker(input));
}

export function revealMarker(input: RevealInput): RevealAction {
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

export function revealCode(scope: Scope, cursor: CursorContext, findHit: boolean): RevealSurface {
    if (revealMermaid(scope, cursor, findHit) === "zone") {
        return { surface: "preview", zone: true, occupy: false };
    }
    return { surface: "raw", ghost: false };
}
