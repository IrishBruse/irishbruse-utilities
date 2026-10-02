import type { Scope, TextRange } from "../document/types";

export function rawGhostClass(): string {
    return "inline-md-ghost";
}

export interface RawLinkSpan {
    readonly start: number;
    readonly end: number;
    readonly className: string;
}

export function rawLinkSpans(text: string, scope: Scope): readonly RawLinkSpan[] {
    const resource = scope.markers.find((marker) => text[marker.start] === "(");
    const labelEnd = resource?.start ?? scope.end;
    const spans: RawLinkSpan[] = [{
        start: scope.start,
        end: labelEnd,
        className: "inline-md-link-label",
    }];
    if (resource) {
        spans.push({
            start: resource.start,
            end: resource.end,
            className: "inline-md-link-url",
        });
    }
    return spans;
}

function headingLevel(scope: Scope): number {
    const raw = scope.level ?? 1;
    return raw >= 1 && raw <= 6 ? Math.trunc(raw) : 1;
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
