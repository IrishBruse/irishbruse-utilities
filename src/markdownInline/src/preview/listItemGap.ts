import type { Scope, TextRange } from "../document/types";

export const LIST_ITEM_GAP_PX = 4;
export const listGapAfterClass = "inline-md-list-gap-after";
export const listLineHeightVariable = "--ib-md-list-line";

export function listMarkerIndentColumns(line: string, markerColumn: number, tabSize: number): number {
    const before = line.slice(0, Math.max(0, markerColumn - 1));
    let columns = 0;
    for (const character of before) {
        if (character === "\t") {
            columns += tabSize;
        } else if (character === " ") {
            columns += 1;
        }
    }
    return columns;
}

export function listMarkerBulletClass(indentColumns: number): string {
    const clamped = Math.max(0, Math.min(indentColumns, 24));
    return `inline-md-list-bullet inline-md-list-indent-${clamped}`;
}

export function listLineHeightPx(lineHeight: number): number {
    return lineHeight + LIST_ITEM_GAP_PX;
}

export function applyListLineHeight(root: HTMLElement, lineHeight: number): void {
    root.style.setProperty(listLineHeightVariable, `${listLineHeightPx(lineHeight)}px`);
}

export interface ListGapPaint {
    readonly lineNumber: number;
    readonly className: string;
    readonly heightPx: number;
    readonly zoneKey: string;
}

export function listGapPaints(model: TextLineModel, scopes: readonly Scope[], tabSize: number): ListGapPaint[] {
    const starts = listItemStartLines(model, scopes, tabSize);
    return listItemGapAfterLines(model, starts, tabSize).map((lineNumber) => ({
        lineNumber,
        className: listGapAfterClass,
        heightPx: LIST_ITEM_GAP_PX,
        zoneKey: `list-gap:${lineNumber}:${LIST_ITEM_GAP_PX}`,
    }));
}

const ORDERED_LIST_LINE = /^\s*\d+(?:\.\s|\)\s)/;

export interface ListItemStart {
    readonly lineNumber: number;
    readonly indentColumns: number;
    readonly contentIndentColumns: number;
}

export interface TextLineModel {
    getLineCount(): number;
    getLineContent(lineNumber: number): string;
    offsetAt(lineNumber: number, column: number): number;
    positionAt(offset: number): { lineNumber: number; column: number };
}

function markerIsTask(scopes: readonly Scope[], markerEnd: number): boolean {
    return scopes.some((scope) => scope.kind === "task" && scope.start === markerEnd);
}

function leadingIndentColumns(line: string, tabSize: number): number {
    let columns = 0;
    for (const character of line) {
        if (character === " ") {
            columns += 1;
        } else if (character === "\t") {
            columns += tabSize;
        } else {
            break;
        }
    }
    return columns;
}

function contentIndentAtColumn(line: string, column: number, tabSize: number): number {
    return listMarkerIndentColumns(line, column, tabSize);
}

function orderedPrefixLength(line: string): number | undefined {
    const match = ORDERED_LIST_LINE.exec(line);
    return match ? match[0].length : undefined;
}

function startFromListMarker(
    model: TextLineModel,
    marker: TextRange,
    tabSize: number,
): ListItemStart {
    const position = model.positionAt(marker.start);
    const line = model.getLineContent(position.lineNumber);
    const contentColumn = model.positionAt(marker.end).column;
    return {
        lineNumber: position.lineNumber,
        indentColumns: listMarkerIndentColumns(line, position.column, tabSize),
        contentIndentColumns: contentIndentAtColumn(line, contentColumn, tabSize),
    };
}

function startFromTask(
    model: TextLineModel,
    marker: TextRange,
    tabSize: number,
): ListItemStart {
    const position = model.positionAt(marker.start);
    const line = model.getLineContent(position.lineNumber);
    const contentColumn = model.positionAt(marker.end).column;
    return {
        lineNumber: position.lineNumber,
        indentColumns: listMarkerIndentColumns(line, position.column, tabSize),
        contentIndentColumns: contentIndentAtColumn(line, contentColumn, tabSize),
    };
}

function startFromOrderedLine(lineNumber: number, line: string, tabSize: number): ListItemStart {
    const prefixLength = orderedPrefixLength(line) ?? 0;
    return {
        lineNumber,
        indentColumns: leadingIndentColumns(line, tabSize),
        contentIndentColumns: contentIndentAtColumn(line, prefixLength + 1, tabSize),
    };
}

export function listItemStartLines(
    model: TextLineModel,
    scopes: readonly Scope[],
    tabSize: number,
): ListItemStart[] {
    const keyed = new Map<number, ListItemStart>();

    for (const scope of scopes) {
        if (scope.kind === "listMarker") {
            const marker = scope.markers[0];
            if (!marker || markerIsTask(scopes, marker.end)) {
                continue;
            }
            const start = startFromListMarker(model, marker, tabSize);
            keyed.set(start.lineNumber, start);
        }
    }
    for (const scope of scopes) {
        if (scope.kind !== "task") {
            continue;
        }
        const marker = scope.markers[0];
        if (!marker) {
            continue;
        }
        const start = startFromTask(model, marker, tabSize);
        keyed.set(start.lineNumber, start);
    }

    for (let lineNumber = 1; lineNumber <= model.getLineCount(); lineNumber += 1) {
        if (keyed.has(lineNumber)) {
            continue;
        }
        const line = model.getLineContent(lineNumber);
        if (!ORDERED_LIST_LINE.test(line)) {
            continue;
        }
        keyed.set(lineNumber, startFromOrderedLine(lineNumber, line, tabSize));
    }

    return [...keyed.values()].sort((left, right) => left.lineNumber - right.lineNumber);
}

function listItemEndLine(
    model: TextLineModel,
    start: ListItemStart,
    startsByLine: ReadonlyMap<number, ListItemStart>,
    tabSize: number,
): number {
    const lineCount = model.getLineCount();
    for (let lineNumber = start.lineNumber + 1; lineNumber <= lineCount; lineNumber += 1) {
        const line = model.getLineContent(lineNumber);
        if (/^\s*$/.test(line)) {
            return lineNumber - 1;
        }
        const nextStart = startsByLine.get(lineNumber);
        if (nextStart !== undefined) {
            if (nextStart.indentColumns <= start.indentColumns) {
                return lineNumber - 1;
            }
            continue;
        }
        const leading = leadingIndentColumns(line, tabSize);
        if (leading >= start.contentIndentColumns) {
            continue;
        }
        return lineNumber - 1;
    }
    return lineCount;
}

export function listItemGapAfterLines(
    model: TextLineModel,
    starts: readonly ListItemStart[],
    tabSize: number,
): number[] {
    const startsByLine = new Map(starts.map((start) => [start.lineNumber, start]));
    const endLines = new Set<number>();
    for (const start of starts) {
        endLines.add(listItemEndLine(model, start, startsByLine, tabSize));
    }
    return [...endLines].sort((left, right) => left - right);
}

export function lineModelFromSource(source: string): TextLineModel {
    const lines = source.split("\n");
    const offsets: number[] = [0];
    for (let index = 0; index < lines.length; index += 1) {
        offsets.push(offsets[index]! + lines[index]!.length + 1);
    }
    return {
        getLineCount: () => lines.length,
        getLineContent: (lineNumber) => lines[lineNumber - 1] ?? "",
        offsetAt: (lineNumber, column) => {
            const lineStart = offsets[lineNumber - 1] ?? 0;
            return lineStart + Math.max(0, column - 1);
        },
        positionAt: (offset) => {
            let lineNumber = 1;
            for (let index = 0; index < lines.length; index += 1) {
                const next = offsets[index + 1] ?? source.length;
                if (offset < next) {
                    lineNumber = index + 1;
                    const lineStart = offsets[index] ?? 0;
                    return { lineNumber, column: offset - lineStart + 1 };
                }
            }
            const last = lines.length;
            const lineStart = offsets[last - 1] ?? 0;
            return { lineNumber: last, column: offset - lineStart + 1 };
        },
    };
}

export function monacoLineModel(model: {
    getLineCount(): number;
    getLineContent(lineNumber: number): string;
    getOffsetAt(position: { lineNumber: number; column: number }): number;
    getPositionAt(offset: number): { lineNumber: number; column: number };
}): TextLineModel {
    return {
        getLineCount: () => model.getLineCount(),
        getLineContent: (lineNumber) => model.getLineContent(lineNumber),
        offsetAt: (lineNumber, column) => model.getOffsetAt({ lineNumber, column }),
        positionAt: (offset) => model.getPositionAt(offset),
    };
}
