import { parse, postprocess, preprocess } from "micromark";
import { gfmAutolinkLiteral } from "micromark-extension-gfm-autolink-literal";
import { gfmStrikethrough } from "micromark-extension-gfm-strikethrough";
import { gfmTaskListItem } from "micromark-extension-gfm-task-list-item";
import type { Scope, TextRange } from "./types";

interface MarkEvent {
    readonly type: "enter" | "exit";
    readonly tokenType: string;
    readonly start: number;
    readonly end: number;
}

function tokenize(source: string): MarkEvent[] {
    const parser = parse({
        extensions: [gfmStrikethrough(), gfmTaskListItem(), gfmAutolinkLiteral()],
    });
    const chunks = preprocess()(source, undefined, true);
    const events = postprocess(parser.document().write(chunks));
    return events.map((event) => {
        const token = event[1] as { type: string; start: { offset?: number }; end: { offset?: number } };
        return {
            type: event[0] as "enter" | "exit",
            tokenType: token.type,
            start: token.start.offset ?? 0,
            end: token.end.offset ?? 0,
        };
    });
}

function matchingExit(events: readonly MarkEvent[], enterIndex: number): number {
    const tokenType = events[enterIndex]?.tokenType;
    let depth = 0;
    for (let index = enterIndex; index < events.length; index++) {
        const event = events[index];
        if (event?.tokenType !== tokenType) {
            continue;
        }
        if (event.type === "enter") {
            depth++;
        } else {
            depth--;
            if (depth === 0) {
                return index;
            }
        }
    }
    return -1;
}

function enterRanges(inner: readonly MarkEvent[], tokenType: string): TextRange[] {
    return inner
        .filter((event) => event.type === "enter" && event.tokenType === tokenType)
        .map((event) => ({ start: event.start, end: event.end }));
}

function directEnterRanges(inner: readonly MarkEvent[], tokenType: string): TextRange[] {
    const ranges: TextRange[] = [];
    let depth = 0;
    for (const event of inner) {
        if (event.type === "enter") {
            if (depth === 0 && event.tokenType === tokenType) {
                ranges.push({ start: event.start, end: event.end });
            }
            depth++;
        } else {
            depth = Math.max(0, depth - 1);
        }
    }
    return ranges;
}

function firstRange(inner: readonly MarkEvent[], tokenType: string): TextRange | undefined {
    const event = inner.find((item) => item.type === "enter" && item.tokenType === tokenType);
    return event ? { start: event.start, end: event.end } : undefined;
}

function lastRange(inner: readonly MarkEvent[], tokenType: string): TextRange | undefined {
    let found: TextRange | undefined;
    for (const event of inner) {
        if (event.type === "enter" && event.tokenType === tokenType) {
            found = { start: event.start, end: event.end };
        }
    }
    return found;
}

function hasEnter(inner: readonly MarkEvent[], tokenType: string): boolean {
    return inner.some((event) => event.type === "enter" && event.tokenType === tokenType);
}

function cleanDestination(raw: string): string {
    const trimmed = raw.trim();
    if (trimmed.startsWith("<") && trimmed.endsWith(">") && trimmed.length >= 2) {
        return trimmed.slice(1, -1);
    }
    return trimmed;
}

function sequenceScope(
    kind: Scope["kind"],
    start: number,
    end: number,
    inner: readonly MarkEvent[],
    sequenceType: string,
    textType: string,
): Scope | undefined {
    const sequences = directEnterRanges(inner, sequenceType);
    if (sequences.length < 2) {
        return undefined;
    }
    const open = sequences[0];
    const close = sequences[sequences.length - 1];
    if (!open || !close) {
        return undefined;
    }
    const text = firstRange(inner, textType);
    return {
        kind,
        start,
        end,
        contentStart: text?.start ?? open.end,
        contentEnd: text?.end ?? close.start,
        markers: [open, close],
    };
}

function buildScope(tokenType: string, start: number, end: number, inner: readonly MarkEvent[], source: string): Scope | undefined {
    switch (tokenType) {
        case "atxHeading": {
            const sequences = directEnterRanges(inner, "atxHeadingSequence");
            const text = firstRange(inner, "atxHeadingText");
            const opening = sequences[0];
            if (!opening) {
                return undefined;
            }
            const contentStart = text?.start ?? opening.end;
            const contentEnd = text?.end ?? contentStart;
            const markers: TextRange[] = [{ start: opening.start, end: contentStart }];
            const closing = sequences[1];
            if (closing && closing.start >= contentEnd) {
                markers.push(closing);
            }
            const level = Math.min(6, Math.max(1, opening.end - opening.start));
            return { kind: "heading", start, end, contentStart, contentEnd, markers, level };
        }
        case "strong":
            return sequenceScope("strong", start, end, inner, "strongSequence", "strongText");
        case "emphasis":
            return sequenceScope("emphasis", start, end, inner, "emphasisSequence", "emphasisText");
        case "strikethrough":
            return sequenceScope("strikethrough", start, end, inner, "strikethroughSequence", "strikethroughText");
        case "codeText": {
            const sequences = directEnterRanges(inner, "codeTextSequence");
            const data = inner.filter((event) => event.type === "enter" && event.tokenType === "codeTextData");
            const first = data[0];
            const last = data[data.length - 1];
            return {
                kind: "inlineCode",
                start,
                end,
                contentStart: first?.start ?? start,
                contentEnd: last?.end ?? end,
                markers: sequences,
            };
        }
        case "link":
        case "image": {
            const label = firstRange(inner, "labelText");
            const destination = lastRange(inner, "resourceDestination");
            const url = destination ? cleanDestination(source.slice(destination.start, destination.end)) : undefined;
            const alt = label ? source.slice(label.start, label.end) : "";
            if (tokenType === "image") {
                return {
                    kind: "image",
                    start,
                    end,
                    contentStart: label?.start ?? start,
                    contentEnd: label?.end ?? start,
                    markers: [{ start, end }],
                    url,
                    alt,
                };
            }
            const markers = [
                ...enterRanges(inner, "labelMarker"),
                ...enterRanges(inner, "labelImageMarker"),
            ];
            const resource = firstRange(inner, "resource");
            if (resource) {
                markers.push(resource);
            }
            return {
                kind: "link",
                start,
                end,
                contentStart: label?.start ?? start,
                contentEnd: label?.end ?? end,
                markers,
                url,
                alt,
            };
        }
        case "autolink": {
            const markers = directEnterRanges(inner, "autolinkMarker");
            const open = markers[0];
            const close = markers[markers.length - 1];
            return {
                kind: "link",
                start,
                end,
                contentStart: open?.end ?? start,
                contentEnd: close?.start ?? end,
                markers,
                url: source.slice(open?.end ?? start, close?.start ?? end),
            };
        }
        case "literalAutolink":
            return {
                kind: "link",
                start,
                end,
                contentStart: start,
                contentEnd: end,
                markers: [],
                url: source.slice(start, end),
            };
        case "listItemPrefix": {
            if (hasEnter(inner, "listItemValue")) {
                return undefined;
            }
            return {
                kind: "listMarker",
                start,
                end,
                contentStart: end,
                contentEnd: end,
                markers: [{ start, end }],
            };
        }
        case "taskListCheck":
            return {
                kind: "task",
                start,
                end,
                contentStart: end,
                contentEnd: end,
                markers: [{ start, end }],
                checked: hasEnter(inner, "taskListCheckValueChecked"),
            };
        case "blockQuote":
            return {
                kind: "blockquote",
                start,
                end,
                contentStart: start,
                contentEnd: end,
                markers: [],
            };
        case "blockQuotePrefix":
            return {
                kind: "blockquoteMarker",
                start,
                end,
                contentStart: end,
                contentEnd: end,
                markers: [{ start, end }],
            };
        case "thematicBreak":
            return {
                kind: "thematicBreak",
                start,
                end,
                contentStart: end,
                contentEnd: end,
                markers: [{ start, end }],
            };
        case "codeFenced": {
            const fences = directEnterRanges(inner, "codeFencedFence");
            const info = firstRange(inner, "codeFencedFenceInfo");
            const values = inner.filter((event) => event.type === "enter" && event.tokenType === "codeFlowValue");
            const firstValue = values[0];
            const lastValue = values[values.length - 1];
            const language = info ? source.slice(info.start, info.end).trim().split(/\s+/)[0] ?? "" : "";
            return {
                kind: "codeBlock",
                start,
                end,
                contentStart: firstValue?.start ?? fences[0]?.end ?? start,
                contentEnd: lastValue?.end ?? end,
                markers: fences,
                language,
            };
        }
        case "codeIndented":
            return {
                kind: "codeBlock",
                start,
                end,
                contentStart: start,
                contentEnd: end,
                markers: [],
                language: "",
            };
        default:
            return undefined;
    }
}

/** Parse markdown into construct scopes. The source string is not rewritten. */
export function parseScopes(source: string): Scope[] {
    const events = tokenize(source);
    const scopes: Scope[] = [];
    for (let index = 0; index < events.length; index++) {
        const event = events[index];
        if (!event || event.type !== "enter") {
            continue;
        }
        const exitIndex = matchingExit(events, index);
        if (exitIndex < 0) {
            continue;
        }
        const exit = events[exitIndex];
        if (!exit) {
            continue;
        }
        const scope = buildScope(event.tokenType, event.start, exit.end, events.slice(index + 1, exitIndex), source);
        if (scope && scope.end > scope.start) {
            scopes.push(scope);
        }
    }
    scopes.sort((left, right) => left.start - right.start || right.end - left.end);
    return scopes;
}
