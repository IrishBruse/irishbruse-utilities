import type { Scope } from "../../document/types";

export interface RawLinkSpan {
    readonly start: number;
    readonly end: number;
    readonly className: string;
}

export function rawLinkSpans(text: string, scope: Scope): readonly RawLinkSpan[] {
    const resource = scope.markers.find((marker) => text[marker.start] === "(");
    if (!resource) {
        return [
            {
                start: scope.start,
                end: scope.end,
                className: "inline-md-link-label",
            },
        ];
    }
    const spans: RawLinkSpan[] = [];
    for (const marker of scope.markers) {
        if (marker.start === resource.start || marker.end !== marker.start + 1) {
            continue;
        }
        spans.push({
            start: marker.start,
            end: marker.end,
            className: "inline-md-link-punctuation",
        });
    }
    if (scope.contentEnd > scope.contentStart) {
        spans.push({
            start: scope.contentStart,
            end: scope.contentEnd,
            className: "inline-md-link-label",
        });
    }
    spans.push({
        start: resource.start,
        end: resource.start + 1,
        className: "inline-md-link-punctuation",
    });
    const close = text[resource.end - 1] === ")" ? resource.end - 1 : resource.end;
    if (close > resource.start + 1) {
        spans.push({
            start: resource.start + 1,
            end: close,
            className: "inline-md-link-url",
        });
    }
    if (close < resource.end) {
        spans.push({
            start: close,
            end: resource.end,
            className: "inline-md-link-punctuation",
        });
    }
    return spans;
}
