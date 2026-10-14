import * as monaco from "monaco-editor/editor/editor.api";
import type { CursorContext, TextRange } from "../../document/types";

export function markerLineAt(
    model: monaco.editor.ITextModel,
    offset: number,
): { lineStart: number; lineEnd: number } {
    const length = model.getValueLength();
    const position = model.getPositionAt(clampOffset(offset, length));
    const lineStart = model.getOffsetAt({ lineNumber: position.lineNumber, column: 1 });
    return { lineStart, lineEnd: lineStart + model.getLineLength(position.lineNumber) };
}

export function cursorContext(
    editor: monaco.editor.IStandaloneCodeEditor,
    model: monaco.editor.ITextModel,
): CursorContext {
    const selection = editor.getSelection();
    const head = selection?.getPosition() ?? { lineNumber: 1, column: 1 };
    const start = selection
        ? { lineNumber: selection.startLineNumber, column: selection.startColumn }
        : head;
    const end = selection
        ? { lineNumber: selection.endLineNumber, column: selection.endColumn }
        : head;
    const lineStart = model.getOffsetAt({ lineNumber: head.lineNumber, column: 1 });
    return {
        selectionFrom: model.getOffsetAt(start),
        selectionTo: model.getOffsetAt(end),
        lineStart,
        lineEnd: lineStart + model.getLineLength(head.lineNumber),
        eolLength: model.getEOL().length,
    };
}

export function spansOverlap(
    start: number,
    end: number,
    otherStart: number,
    otherEnd: number,
): boolean {
    return start < otherEnd && end > otherStart;
}

export function withoutTrailingLineBreak(text: string, from: number, to: number): TextRange {
    let end = to;
    if (end > from && text[end - 1] === "\n") {
        end -= 1;
        if (end > from && text[end - 1] === "\r") {
            end -= 1;
        }
    }
    return { start: from, end };
}

export function subtractRanges(
    start: number,
    end: number,
    cuts: readonly TextRange[],
): TextRange[] {
    let segments: TextRange[] = [{ start, end }];
    for (const cut of cuts) {
        const next: TextRange[] = [];
        for (const segment of segments) {
            if (!spansOverlap(segment.start, segment.end, cut.start, cut.end)) {
                next.push(segment);
                continue;
            }
            if (cut.start > segment.start) {
                next.push({ start: segment.start, end: cut.start });
            }
            if (cut.end < segment.end) {
                next.push({ start: cut.end, end: segment.end });
            }
        }
        segments = next;
    }
    return segments.filter((segment) => segment.end > segment.start);
}

export function paintInline(
    decorations: monaco.editor.IModelDeltaDecoration[],
    model: monaco.editor.ITextModel,
    text: string,
    start: number,
    end: number,
    replaced: readonly TextRange[],
    className: string,
): void {
    const bounds = withoutTrailingLineBreak(text, start, end);
    if (bounds.end <= bounds.start) {
        return;
    }
    for (const segment of subtractRanges(bounds.start, bounds.end, replaced)) {
        decorations.push({
            range: rangeFromOffsets(model, segment.start, segment.end),
            options: { inlineClassName: className },
        });
    }
}

export function lineNumbersCovering(
    model: monaco.editor.ITextModel,
    text: string,
    range: TextRange,
): number[] {
    if (range.end <= range.start) {
        return [];
    }
    const length = text.length;
    const start = model.getPositionAt(clampOffset(range.start, length));
    const end = model.getPositionAt(clampOffset(range.end, length));
    let last = end.lineNumber;
    if (end.column === 1 && last > start.lineNumber) {
        last -= 1;
    }
    const lines: number[] = [];
    for (let line = start.lineNumber; line <= last; line += 1) {
        lines.push(line);
    }
    return lines;
}

export function findHits(range: TextRange, finds: readonly TextRange[]): boolean {
    return finds.some((hit) => hit.start < range.end && hit.end > range.start);
}

export function findRevealRanges(
    editor: monaco.editor.IStandaloneCodeEditor,
    model: monaco.editor.ITextModel,
): TextRange[] {
    const controller = editor.getContribution("editor.contrib.findController") as {
        getState(): {
            searchString: string;
            isRevealed: boolean;
            isRegex: boolean;
            wholeWord: boolean;
            matchCase: boolean;
        };
    } | null;
    const state = controller?.getState();
    if (!state?.isRevealed || state.searchString.length === 0) {
        return [];
    }
    const wordSeparators = state.wholeWord
        ? editor.getOption(monaco.editor.EditorOption.wordSeparators)
        : null;
    return model
        .findMatches(
            state.searchString,
            false,
            state.isRegex,
            state.matchCase,
            wordSeparators,
            false,
            500,
        )
        .map((match) => ({
            start: model.getOffsetAt(match.range.getStartPosition()),
            end: model.getOffsetAt(match.range.getEndPosition()),
        }));
}

export function clampOffset(offset: number, length: number): number {
    if (offset < 0) {
        return 0;
    }
    if (offset > length) {
        return length;
    }
    return offset;
}

export function rangeFromOffsets(
    model: monaco.editor.ITextModel,
    start: number,
    end: number,
): monaco.Range {
    const length = model.getValueLength();
    const from = model.getPositionAt(clampOffset(start, length));
    const to = model.getPositionAt(clampOffset(end, length));
    return new monaco.Range(from.lineNumber, from.column, to.lineNumber, to.column);
}

export function coveredLine(
    model: monaco.editor.ITextModel,
    marker: TextRange,
): number | undefined {
    const length = model.getValueLength();
    const start = model.getPositionAt(clampOffset(marker.start, length));
    const end = model.getPositionAt(clampOffset(marker.end, length));
    const lineNumber = start.lineNumber;
    if (end.lineNumber !== lineNumber && !(end.lineNumber === lineNumber + 1 && end.column === 1)) {
        return undefined;
    }
    const lineStart = model.getOffsetAt({ lineNumber, column: 1 });
    const lineEnd = lineStart + model.getLineLength(lineNumber);
    if (marker.start <= lineStart && marker.end >= lineEnd && lineEnd > lineStart) {
        return lineNumber;
    }
    return undefined;
}

export function hideOptions(
    before?: monaco.editor.InjectedTextOptions,
): monaco.editor.IModelDecorationOptions {
    return {
        inlineClassName: "inline-md-hidden",
        inlineClassNameAffectsLetterSpacing: true,
        before,
    };
}

export function injected(
    content: string,
    inlineClassName: string,
): monaco.editor.InjectedTextOptions {
    return {
        content,
        inlineClassName,
        inlineClassNameAffectsLetterSpacing: true,
        cursorStops: monaco.editor.InjectedTextCursorStops.None,
    };
}
