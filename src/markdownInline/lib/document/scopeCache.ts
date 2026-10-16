import { blockSafeParseSpan, type ParseNeed } from "./parseWindow";
import { parseScopes, parseScopesRange } from "./scopes";
import type { Scope, TextRange } from "./types";

export const fullPaintLineLimit = 2000;

export interface ScopeEntry {
    readonly version: number;
    readonly text: string;
    readonly scopes: readonly Scope[];
    readonly covered: readonly TextRange[];
}

interface Segment {
    readonly startOffset: number;
    readonly endOffset: number;
    readonly scopes: readonly Scope[];
}

interface CacheRecord {
    version: number;
    text: string;
    scopes: readonly Scope[];
    covered: readonly TextRange[];
    segments: Segment[] | undefined;
}

const entries = new Map<string, CacheRecord>();

function lineNumberAt(source: string, offset: number): number {
    let line = 1;
    const end = Math.min(Math.max(0, offset), source.length);
    for (let index = 0; index < end; index += 1) {
        if (source.charCodeAt(index) === 10) {
            line += 1;
        }
    }
    return line;
}

function uncovered(segments: readonly Segment[], start: number, end: number): TextRange[] {
    const sorted = [...segments].sort(
        (left, right) => left.startOffset - right.startOffset || left.endOffset - right.endOffset,
    );
    const gaps: TextRange[] = [];
    let cursor = start;
    for (const segment of sorted) {
        if (segment.endOffset <= cursor) {
            continue;
        }
        if (segment.startOffset >= end) {
            break;
        }
        if (segment.startOffset > cursor) {
            gaps.push({ start: cursor, end: Math.min(segment.startOffset, end) });
        }
        cursor = Math.max(cursor, segment.endOffset);
        if (cursor >= end) {
            return gaps;
        }
    }
    if (cursor < end) {
        gaps.push({ start: cursor, end });
    }
    return gaps;
}

function mergeScopes(segments: readonly Segment[]): Scope[] {
    const merged: Scope[] = [];
    const seen = new Set<string>();
    const scopes = segments.flatMap((segment) => segment.scopes);
    scopes.sort((left, right) => left.start - right.start || right.end - left.end);
    for (const scope of scopes) {
        const key = `${scope.kind}:${scope.start}:${scope.end}`;
        if (seen.has(key)) {
            continue;
        }
        seen.add(key);
        merged.push(scope);
    }
    return merged;
}

function ensureWindow(entry: CacheRecord, need: ParseNeed): ScopeEntry {
    const span = blockSafeParseSpan(entry.text, need);
    const segments = entry.segments ?? [];
    for (const gap of uncovered(segments, span.startOffset, span.endOffset)) {
        if (gap.end <= gap.start) {
            continue;
        }
        segments.push({
            startOffset: gap.start,
            endOffset: gap.end,
            scopes: parseScopesRange(
                entry.text,
                gap.start,
                gap.end,
                lineNumberAt(entry.text, gap.start),
            ),
        });
    }
    segments.sort(
        (left, right) => left.startOffset - right.startOffset || left.endOffset - right.endOffset,
    );
    entry.segments = segments;
    entry.covered = segments.map((segment) => ({
        start: segment.startOffset,
        end: segment.endOffset,
    }));
    entry.scopes = mergeScopes(segments);
    return entry;
}

export function cachedScopes(
    key: string,
    version: number,
    read: () => string,
    need?: ParseNeed,
): ScopeEntry {
    const found = entries.get(key);
    if (found && found.version === version) {
        if (!need || need.lineCount <= fullPaintLineLimit || found.segments === undefined) {
            return found;
        }
        return ensureWindow(found, need);
    }
    const text = read();
    if (!need || need.lineCount <= fullPaintLineLimit) {
        const entry: CacheRecord = {
            version,
            text,
            scopes: parseScopes(text),
            covered: [{ start: 0, end: text.length }],
            segments: undefined,
        };
        entries.set(key, entry);
        return entry;
    }
    const entry: CacheRecord = {
        version,
        text,
        scopes: [],
        covered: [],
        segments: [],
    };
    entries.set(key, entry);
    return ensureWindow(entry, need);
}

export function releaseScopes(key: string): void {
    entries.delete(key);
}
