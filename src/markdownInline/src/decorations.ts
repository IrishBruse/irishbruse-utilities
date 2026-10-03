import * as monaco from "monaco-editor/esm/vs/editor/editor.api";
import { blockquoteContentIndex, blockquoteDepthClass, blockquoteLineDepth } from "./preview/blockquote";
import { applyListLineHeight, listGapPaints, listMarkerBulletClass, listMarkerIndentColumns, listMarkerIsTask, monacoLineModel } from "./preview/listItemGap";
import { blockZone as buildBlockZone, createMermaidZone as buildMermaidZone, headingLevel, imageZoneKey, tableZone as buildTableZone, type BlockZoneHost } from "./preview/blockZone";
import { isMermaidCodeBlock } from "./preview/mermaid";
import { previewContentClass, previewContentRange } from "./preview/paint";
import { refreshMermaidCodeLens, setHiddenAreas } from "./monaco";
import { rawGhostClass, rawHeadingBounds, rawHeadingClass, rawLinkSpans } from "./raw/paint";
import { reveal, revealCode, showFormatted } from "./reveal";
import { parseScopes } from "./document/scopes";
import { layoutSelectionPieces, stretchesSelectionLine } from "./selection";
import { readFrontMatter, type FrontMatterSpan } from "./skill";
import type { CursorContext, Scope, TextRange } from "./document/types";

export interface InlinePresentationHandlers {
    onToggleTask(from: number, to: number): void;
    onReveal(offset: number): void;
    onReplace(from: number, to: number, text: string): void;
    onLink?(href: string): void;
    onOpenMermaidPreview?(openLine: number): void;
}

interface ZoneRecord {
    readonly key: string;
    readonly zone: monaco.editor.IViewZone;
    id?: string;
    placedAfter?: number;
    placedHeight?: number;
}

class TaskWidget implements monaco.editor.IContentWidget {
    readonly allowEditorOverflow = false;

    constructor(
        private readonly id: string,
        private readonly node: HTMLElement,
        private position: monaco.IPosition,
    ) {}

    getId(): string {
        return this.id;
    }

    getDomNode(): HTMLElement {
        return this.node;
    }

    getPosition(): monaco.editor.IContentWidgetPosition {
        return {
            position: this.position,
            preference: [monaco.editor.ContentWidgetPositionPreference.EXACT],
        };
    }

    setPosition(position: monaco.IPosition): void {
        this.position = position;
    }
}

function markerLineAt(model: monaco.editor.ITextModel, offset: number): { lineStart: number; lineEnd: number } {
    const length = model.getValueLength();
    const position = model.getPositionAt(clampOffset(offset, length));
    const lineStart = model.getOffsetAt({ lineNumber: position.lineNumber, column: 1 });
    return { lineStart, lineEnd: lineStart + model.getLineLength(position.lineNumber) };
}

function cursorContext(editor: monaco.editor.IStandaloneCodeEditor, model: monaco.editor.ITextModel): CursorContext {
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

function spansOverlap(start: number, end: number, otherStart: number, otherEnd: number): boolean {
    return start < otherEnd && end > otherStart;
}

function withoutTrailingLineBreak(text: string, from: number, to: number): TextRange {
    let end = to;
    if (end > from && text[end - 1] === "\n") {
        end -= 1;
        if (end > from && text[end - 1] === "\r") {
            end -= 1;
        }
    }
    return { start: from, end };
}

function subtractRanges(start: number, end: number, cuts: readonly TextRange[]): TextRange[] {
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

function paintInline(
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

const HEADING_SCALE = [1, 1.5, 1.4, 1.25, 1.1, 1, 0.85];
const HEADING_PAD = 2;

function headingExtraHeight(level: number, fontSize: number, lineHeight: number): number {
    const scale = HEADING_SCALE[level] ?? 1;
    if (scale <= 1 || fontSize <= 0) {
        return 0;
    }
    return HEADING_PAD * 2;
}

function lineNumbersCovering(model: monaco.editor.ITextModel, text: string, range: TextRange): number[] {
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

function lineClass(scope: Scope): string | undefined {
    if (scope.kind === "codeBlock") {
        return "inline-md-code-line";
    }
    return undefined;
}

function findHits(range: TextRange, finds: readonly TextRange[]): boolean {
    return finds.some((hit) => hit.start < range.end && hit.end > range.start);
}

function findRevealRanges(editor: monaco.editor.IStandaloneCodeEditor, model: monaco.editor.ITextModel): TextRange[] {
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
    return model.findMatches(
        state.searchString,
        false,
        state.isRegex,
        state.matchCase,
        wordSeparators,
        false,
        500,
    ).map((match) => ({
        start: model.getOffsetAt(match.range.getStartPosition()),
        end: model.getOffsetAt(match.range.getEndPosition()),
    }));
}

function clampOffset(offset: number, length: number): number {
    if (offset < 0) {
        return 0;
    }
    if (offset > length) {
        return length;
    }
    return offset;
}

function rangeFromOffsets(model: monaco.editor.ITextModel, start: number, end: number): monaco.Range {
    const length = model.getValueLength();
    const from = model.getPositionAt(clampOffset(start, length));
    const to = model.getPositionAt(clampOffset(end, length));
    return new monaco.Range(from.lineNumber, from.column, to.lineNumber, to.column);
}

function coveredLine(model: monaco.editor.ITextModel, marker: TextRange): number | undefined {
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

function hideOptions(before?: monaco.editor.InjectedTextOptions): monaco.editor.IModelDecorationOptions {
    return {
        inlineClassName: "inline-md-hidden",
        inlineClassNameAffectsLetterSpacing: true,
        before,
    };
}

function injected(content: string, inlineClassName: string): monaco.editor.InjectedTextOptions {
    return {
        content,
        inlineClassName,
        inlineClassNameAffectsLetterSpacing: true,
        cursorStops: monaco.editor.InjectedTextCursorStops.None,
    };
}

export class InlinePresentation {
    private readonly decorations: monaco.editor.IEditorDecorationsCollection;
    private readonly widgets = new Map<string, TaskWidget>();
    private readonly hits = new Map<string, TaskWidget>();
    private zones: ZoneRecord[] = [];
    private zoneKey = "";
    private headingExtras = new Map<number, number>();
    private selectionListener: monaco.IDisposable | undefined;
    private selectionFrame = 0;
    private frontMatter: FrontMatterSpan | undefined;
    private readonly mermaidZones = new Map<string, ZoneRecord>();
    private readonly imageZones = new Map<string, ZoneRecord>();
    private mermaidLensKey = "";
    private hiddenLineNumbers = new Set<number>();
    private findListener: monaco.IDisposable | undefined;
    private updating = false;
    private updateQueued = false;

    constructor(
        private readonly editor: monaco.editor.IStandaloneCodeEditor,
        private readonly documentUrl: string,
        private readonly handlers: InlinePresentationHandlers,
        private readonly skillFrontMatter: boolean,
    ) {
        this.decorations = editor.createDecorationsCollection();
        const controller = editor.getContribution("editor.contrib.findController") as {
            getState(): { onFindReplaceStateChange(listener: () => void): monaco.IDisposable };
        } | null;
        this.findListener = controller?.getState().onFindReplaceStateChange(() => {
            this.update();
        });
        this.selectionListener = editor.onDidChangeCursorSelection(() => {
            this.scheduleSelectionHeights();
        });
    }

    prepareReveal(offset: number): void {
        const model = this.editor.getModel();
        if (!model) {
            return;
        }
        const clamped = Math.max(0, Math.min(offset, model.getValueLength()));
        const line = model.getPositionAt(clamped).lineNumber;
        if (!this.hiddenLineNumbers.has(line)) {
            return;
        }
        this.hiddenLineNumbers.delete(line);
        this.writeHiddenAreas(model);
    }

    isHiddenLine(lineNumber: number): boolean {
        return this.hiddenLineNumbers.has(lineNumber);
    }

    update(): void {
        if (this.updating) {
            this.updateQueued = true;
            return;
        }
        this.updating = true;
        try {
            this.render();
        } finally {
            this.updating = false;
        }
        if (this.updateQueued) {
            this.updateQueued = false;
            this.update();
        }
    }

    private render(): void {
        const model = this.editor.getModel();
        if (!model) {
            return;
        }
        const text = model.getValue();
        this.frontMatter = this.skillFrontMatter ? readFrontMatter(text) : undefined;
        const cursor = cursorContext(this.editor, model);
        const finds = findRevealRanges(this.editor, model);
        const scopes = parseScopes(text);
        const decorations: monaco.editor.IModelDeltaDecoration[] = [];
        const replaced: TextRange[] = [];
        const hiddenLines = new Set<number>();
        const zones: ZoneRecord[] = [];
        const tasks: { id: string; from: number; to: number; checked: boolean; position: monaco.IPosition }[] = [];
        const hits: { id: string; text: string; offset: number; position: monaco.IPosition }[] = [];
        const headingLines = new Map<number, number>();

        const addHidden = (scope: Scope): void => {
            for (let index = 0; index < scope.markers.length; index += 1) {
                const marker = scope.markers[index];
                if (!marker || marker.end <= marker.start) {
                    continue;
                }
                const findHit = findHits(scope, finds);
                const markerLine = markerLineAt(model, marker.start);
                const frontMatterEnd = this.frontMatter?.end;
                let decision = reveal({
                    scope,
                    marker,
                    cursor,
                    markerLine,
                    findHit,
                    frontMatterEnd,
                    singleLine: false,
                });
                if (decision.surface !== "preview") {
                    continue;
                }
                const bounds = withoutTrailingLineBreak(text, marker.start, marker.end);
                if (bounds.end <= bounds.start || bounds.start < 0 || bounds.end > text.length) {
                    continue;
                }
                if (replaced.some((range) => spansOverlap(bounds.start, bounds.end, range.start, range.end))) {
                    continue;
                }
                if (!decision.zone && !decision.occupy && (scope.kind === "image" || scope.kind === "thematicBreak")) {
                    decision = reveal({
                        scope,
                        marker,
                        cursor,
                        markerLine,
                        findHit,
                        frontMatterEnd,
                        singleLine: coveredLine(model, bounds) !== undefined,
                    });
                }
                if (decision.surface !== "preview") {
                    continue;
                }
                replaced.push(bounds);
                if (decision.occupy) {
                    continue;
                }
                if (decision.zone && scope.kind === "table") {
                    const lines = lineNumbersCovering(model, text, bounds);
                    for (const line of lines) {
                        hiddenLines.add(line);
                    }
                    const first = lines[0];
                    if (first !== undefined) {
                        zones.push(this.tableZone(scope, text, scopes, bounds.start, first));
                    }
                    continue;
                }
                if (decision.zone) {
                    const line = coveredLine(model, bounds);
                    if (line !== undefined) {
                        hiddenLines.add(line);
                        zones.push(
                            scope.kind === "image"
                                ? this.ensureImageZone(scope, bounds.start, line)
                                : this.blockZone(scope, bounds.start, line),
                        );
                    }
                    continue;
                }
                const before = scope.kind === "blockquoteMarker"
                    ? undefined
                    : this.replacement(scope, marker, index, scopes, tasks, model);
                decorations.push({
                    range: rangeFromOffsets(model, bounds.start, bounds.end),
                    options: scope.kind === "blockquoteMarker"
                        ? { inlineClassName: "inline-md-quote-marker" }
                        : {
                            ...hideOptions(before),
                            ...(scope.kind === "listMarker" && !listMarkerIsTask(scopes, marker.end)
                                ? {
                                    firstLineDecorationClassName: listMarkerBulletClass(
                                        listMarkerIndentColumns(
                                            model.getLineContent(model.getPositionAt(marker.start).lineNumber),
                                            model.getPositionAt(marker.start).column,
                                            this.editor.getOption(monaco.editor.EditorOption.tabSize),
                                        ),
                                    ),
                                }
                                : {}),
                        },
                });
            }
        };

        for (const scope of scopes) {
            if (scope.kind === "image" || scope.kind === "thematicBreak") {
                addHidden(scope);
            }
        }
        for (const scope of scopes) {
            if (scope.kind !== "image" && scope.kind !== "thematicBreak") {
                addHidden(scope);
            }
        }

        for (const scope of scopes) {
            if (scope.kind !== "codeBlock" || !isMermaidCodeBlock(scope.language)) {
                continue;
            }
            if (revealCode(scope, cursor, findHits(scope, finds)).surface !== "preview") {
                continue;
            }
            const lines = lineNumbersCovering(model, text, { start: scope.start, end: scope.end });
            for (const line of lines) {
                hiddenLines.add(line);
            }
            const first = lines[0];
            if (first !== undefined) {
                zones.push(this.ensureMermaidZone(scope, text, first));
            }
        }
        const liveImageKeys = new Set<string>();
        for (const scope of scopes) {
            if (scope.kind !== "image") {
                continue;
            }
            const marker = scope.markers[0];
            if (!marker) {
                continue;
            }
            const bounds = withoutTrailingLineBreak(text, marker.start, marker.end);
            liveImageKeys.add(imageZoneKey(scope.url, bounds.start, this.documentUrl));
        }
        for (const key of this.imageZones.keys()) {
            if (!liveImageKeys.has(key)) {
                this.imageZones.delete(key);
            }
        }

        const activeMermaidKeys = new Set(
            zones.filter((zone) => zone.key.startsWith("mermaid:")).map((zone) => zone.key),
        );
        for (const key of this.mermaidZones.keys()) {
            if (!activeMermaidKeys.has(key)) {
                this.mermaidZones.delete(key);
            }
        }

        for (const scope of scopes) {
            const formatted = showFormatted(scope, cursor, findHits(scope, finds));
            const rawHeading = scope.kind === "heading" && !formatted;
            const className = rawHeading
                ? rawHeadingClass(scope)
                : formatted
                    ? previewContentClass(scope)
                    : undefined;
            if (className) {
                const range = rawHeading ? rawHeadingBounds(text, scope) : previewContentRange(scope);
                const start = range.start;
                const end = range.end;
                if (end > start) {
                    for (const segment of subtractRanges(start, end, replaced)) {
                        decorations.push({
                            range: rangeFromOffsets(model, segment.start, segment.end),
                            options: {
                                inlineClassName: className,
                                inlineClassNameAffectsLetterSpacing: scope.kind === "heading",
                            },
                        });
                    }
                    if (scope.kind === "heading") {
                        const startLine = model.getPositionAt(clampOffset(start, text.length)).lineNumber;
                        const endLine = model.getPositionAt(clampOffset(end - 1, text.length)).lineNumber;
                        const level = headingLevel(scope);
                        for (let line = startLine; line <= endLine; line += 1) {
                            headingLines.set(line, level);
                        }
                    }
                }
            }
            if (scope.kind === "link" && !formatted) {
                for (const span of rawLinkSpans(text, scope)) {
                    paintInline(decorations, model, text, span.start, span.end, replaced, span.className);
                }
            }
            for (const marker of scope.markers) {
                const ghost = reveal({
                    scope,
                    marker,
                    cursor,
                    markerLine: markerLineAt(model, marker.start),
                    findHit: findHits(scope, finds),
                    frontMatterEnd: this.frontMatter?.end,
                    singleLine: false,
                });
                if (ghost.surface !== "raw" || !ghost.ghost) {
                    continue;
                }
                for (const segment of subtractRanges(marker.start, marker.end, replaced)) {
                    decorations.push({
                        range: rangeFromOffsets(model, segment.start, segment.end),
                        options: { inlineClassName: rawGhostClass() },
                    });
                }
            }
            this.addLineDecorations(model, scope, decorations);
            if (
                scope.kind === "codeBlock"
                && scope.markers.some((marker) => {
                    const hidden = reveal({
                        scope,
                        marker,
                        cursor,
                        markerLine: markerLineAt(model, marker.start),
                        findHit: false,
                        frontMatterEnd: this.frontMatter?.end,
                        singleLine: false,
                    });
                    return hidden.surface === "preview" && !hidden.zone && !hidden.occupy;
                })
                && !(isMermaidCodeBlock(scope.language) && revealCode(scope, cursor, false).surface === "preview")
            ) {
                const codeText = text.slice(scope.contentStart, scope.contentEnd).trim();
                if (codeText.length > 0) {
                    hits.push({
                        id: `code-${scope.start}`,
                        text: codeText,
                        offset: scope.contentStart + 1,
                        position: model.getPositionAt(clampOffset(scope.contentStart, text.length)),
                    });
                }
            }
        }

        const fontSize = this.editor.getOption(monaco.editor.EditorOption.fontSize);
        const lineHeight = this.editor.getOption(monaco.editor.EditorOption.lineHeight);
        this.syncHeadingLineHeights(fontSize, lineHeight);
        const listRoot = this.editor.getDomNode()?.closest(".inline-md-root");
        if (listRoot instanceof HTMLElement) {
            applyListLineHeight(listRoot, lineHeight);
        }
        this.syncCurrentLine(headingLines, fontSize, lineHeight);
        const quoteDepths = new Map<number, number>();
        for (const scope of scopes) {
            if (scope.kind !== "blockquote") {
                continue;
            }
            const quoteStart = model.getPositionAt(clampOffset(scope.start, text.length));
            const quoteEnd = model.getPositionAt(clampOffset(Math.max(scope.start, scope.end - 1), text.length));
            for (let line = quoteStart.lineNumber; line <= quoteEnd.lineNumber; line += 1) {
                const depth = blockquoteLineDepth(model.getLineContent(line));
                if (depth <= 0) {
                    continue;
                }
                quoteDepths.set(line, Math.max(quoteDepths.get(line) ?? 0, depth));
            }
        }
        for (const [lineNumber, depth] of quoteDepths) {
            const content = model.getLineContent(lineNumber);
            const lineStart = model.getOffsetAt({ lineNumber, column: 1 });
            const lineEnd = lineStart + content.length;
            const raw = scopes.some((scope) => {
                if (scope.kind !== "blockquoteMarker") {
                    return false;
                }
                return scope.markers.some((marker) => {
                    if (marker.start < lineStart || marker.start > lineEnd) {
                        return false;
                    }
                    const decision = reveal({
                        scope,
                        marker,
                        cursor,
                        markerLine: markerLineAt(model, marker.start),
                        findHit: findHits(scope, finds),
                        frontMatterEnd: this.frontMatter?.end,
                        singleLine: false,
                    });
                    return decision.surface !== "preview";
                });
            });
            if (!raw) {
                decorations.push({
                    range: new monaco.Range(lineNumber, 1, lineNumber, 1),
                    options: {
                        isWholeLine: true,
                        className: `inline-md-quote ${blockquoteDepthClass(depth)}`,
                    },
                });
            }
            const start = blockquoteContentIndex(content);
            if (start < content.length) {
                decorations.push({
                    range: new monaco.Range(lineNumber, start + 1, lineNumber, content.length + 1),
                    options: { inlineClassName: "inline-md-quote-text" },
                });
            }
        }

        const headingExtras = new Map<number, number>();
        for (const [lineNumber, level] of headingLines) {
            const extra = headingExtraHeight(level, fontSize, lineHeight);
            if (extra <= 0) {
                continue;
            }
            headingExtras.set(lineNumber, extra);
            const spacer = document.createElement("div");
            zones.push({
                key: `heading-gap:${lineNumber}:${extra}`,
                zone: {
                    afterLineNumber: lineNumber,
                    heightInPx: extra,
                    domNode: spacer,
                    suppressMouseDown: true,
                },
            });
        }

        const tabSize = this.editor.getOption(monaco.editor.EditorOption.tabSize);
        const lineModel = monacoLineModel(model);
        for (const gap of listGapPaints(lineModel, scopes, tabSize)) {
            decorations.push({
                range: new monaco.Range(gap.lineNumber, 1, gap.lineNumber, 1),
                options: {
                    isWholeLine: true,
                    className: gap.className,
                },
            });
            const spacer = document.createElement("div");
            zones.push({
                key: gap.zoneKey,
                zone: {
                    afterLineNumber: gap.lineNumber,
                    heightInPx: gap.heightPx,
                    domNode: spacer,
                    suppressMouseDown: true,
                },
            });
        }

        this.headingExtras = headingExtras;
        this.paintFrontMatter(model, decorations);
        this.decorations.set(decorations);
        this.syncTasks(tasks);
        this.syncHits(hits);
        this.syncZones(zones);
        this.scheduleSelectionHeights();
        const mermaidLensKey = scopes
            .filter((scope) => scope.kind === "codeBlock" && isMermaidCodeBlock(scope.language))
            .map((scope) => `${scope.start}:${scope.end}:${text.slice(scope.contentStart, scope.contentEnd).trim()}`)
            .join("|");
        if (mermaidLensKey !== this.mermaidLensKey) {
            this.mermaidLensKey = mermaidLensKey;
            refreshMermaidCodeLens();
        }
        this.hiddenLineNumbers = hiddenLines;
        this.writeHiddenAreas(model);
    }

    private syncHeadingLineHeights(fontSize: number, lineHeight: number): void {
        const root = this.editor.getDomNode()?.closest(".inline-md-root");
        if (!(root instanceof HTMLElement)) {
            return;
        }
        for (let level = 1; level <= 6; level += 1) {
            const extra = headingExtraHeight(level, fontSize, lineHeight);
            root.style.setProperty(`--ib-md-h${level}-line`, `${lineHeight + extra}px`);
        }
    }

    private writeHiddenAreas(model: monaco.editor.ITextModel): void {
        setHiddenAreas(this.editor, [...this.hiddenLineNumbers].map((lineNumber) => ({
            startLineNumber: lineNumber,
            startColumn: 1,
            endLineNumber: lineNumber,
            endColumn: model.getLineMaxColumn(lineNumber),
        })));
    }

    dispose(): void {
        this.decorations.clear();
        this.syncTasks([]);
        this.syncHits([]);
        this.zoneKey = "";
        this.editor.changeViewZones((accessor) => {
            for (const zone of this.zones) {
                if (zone.id) {
                    accessor.removeZone(zone.id);
                }
            }
        });
        this.zones = [];
        this.imageZones.clear();
        this.mermaidZones.clear();
        this.mermaidLensKey = "";
        setHiddenAreas(this.editor, []);
        this.findListener?.dispose();
        this.findListener = undefined;
        this.selectionListener?.dispose();
        this.selectionListener = undefined;
        if (this.selectionFrame !== 0) {
            cancelAnimationFrame(this.selectionFrame);
            this.selectionFrame = 0;
        }
    }

    private replacement(
        scope: Scope,
        marker: TextRange,
        index: number,
        scopes: readonly Scope[],
        tasks: { id: string; from: number; to: number; checked: boolean; position: monaco.IPosition }[],
        model: monaco.editor.ITextModel,
    ): monaco.editor.InjectedTextOptions | undefined {
        switch (scope.kind) {
            case "listMarker":
                return undefined;
            case "task": {
                const position = model.getPositionAt(clampOffset(marker.start, model.getValueLength()));
                tasks.push({
                    id: `task-${marker.start}-${marker.end}`,
                    from: marker.start,
                    to: marker.end,
                    checked: scope.checked === true,
                    position,
                });
                return injected("☐ ", "inline-md-task-spacer");
            }
            case "codeBlock":
                if (index !== 0) {
                    return undefined;
                }
                return injected(scope.language && scope.language.length > 0 ? scope.language : "text", "inline-md-lang");
            default:
                return undefined;
        }
    }

    private zoneHost(): BlockZoneHost {
        const onLink = this.handlers.onLink;
        const onOpenMermaidPreview = this.handlers.onOpenMermaidPreview;
        return {
            onReveal: (offset) => {
                this.handlers.onReveal(offset);
            },
            onLink: onLink
                ? (href) => {
                    this.handlers.onLink?.(href);
                }
                : undefined,
            onOpenMermaidPreview: onOpenMermaidPreview
                ? (openLine) => {
                    this.handlers.onOpenMermaidPreview?.(openLine);
                }
                : undefined,
            onLayout: (key) => {
                this.layoutZone(key);
            },
            documentUrl: this.documentUrl,
            lineHeight: this.editor.getOption(monaco.editor.EditorOption.lineHeight),
        };
    }

    private blockZone(scope: Scope, from: number, lineNumber: number): ZoneRecord {
        return buildBlockZone(scope, from, lineNumber, this.zoneHost());
    }

    private ensureImageZone(scope: Scope, from: number, lineNumber: number): ZoneRecord {
        const key = imageZoneKey(scope.url, from, this.documentUrl);
        const existing = this.imageZones.get(key);
        if (existing) {
            existing.zone.afterLineNumber = lineNumber - 1;
            return existing;
        }
        const record = this.blockZone(scope, from, lineNumber);
        this.imageZones.set(record.key, record);
        return record;
    }

    private ensureMermaidZone(scope: Scope, source: string, lineNumber: number): ZoneRecord {
        const content = source.slice(scope.contentStart, scope.contentEnd).trim();
        const key = `mermaid:${scope.start}:${scope.end}:${content}`;
        const existing = this.mermaidZones.get(key);
        if (existing) {
            return existing;
        }
        const record = this.createMermaidZone(scope, content, key, lineNumber);
        this.mermaidZones.set(key, record);
        return record;
    }

    private createMermaidZone(scope: Scope, content: string, key: string, lineNumber: number): ZoneRecord {
        return buildMermaidZone(scope, content, key, lineNumber, this.zoneHost());
    }

    private tableZone(
        scope: Scope,
        source: string,
        scopes: readonly Scope[],
        from: number,
        lineNumber: number,
    ): ZoneRecord {
        return buildTableZone(scope, source, scopes, from, lineNumber, this.zoneHost());
    }

    private layoutZone(key: string): void {
        const record = this.zones.find((zone) => zone.key === key);
        if (!record?.id) {
            return;
        }
        record.placedAfter = record.zone.afterLineNumber;
        record.placedHeight = record.zone.heightInPx;
        this.editor.changeViewZones((accessor) => {
            if (record.id) {
                accessor.layoutZone(record.id);
            }
        });
    }

    private paintFrontMatter(
        model: monaco.editor.ITextModel,
        decorations: monaco.editor.IModelDeltaDecoration[],
    ): void {
        const span = this.frontMatter;
        if (!span) {
            return;
        }
        const length = model.getValueLength();
        const start = model.getPositionAt(0);
        const end = model.getPositionAt(clampOffset(Math.max(0, span.end - 1), length));
        for (let line = start.lineNumber; line <= end.lineNumber; line += 1) {
            decorations.push({
                range: new monaco.Range(line, 1, line, 1),
                options: { isWholeLine: true, className: "inline-md-code-line" },
            });
        }
        const column = Math.min(2, model.getLineMaxColumn(start.lineNumber));
        decorations.push({
            range: new monaco.Range(start.lineNumber, 1, start.lineNumber, column),
            options: {
                before: injected("yaml", "inline-md-lang"),
            },
        });
    }

    private addLineDecorations(
        model: monaco.editor.ITextModel,
        scope: Scope,
        decorations: monaco.editor.IModelDeltaDecoration[],
    ): void {
        const className = lineClass(scope);
        if (!className || scope.end <= scope.start) {
            return;
        }
        const length = model.getValueLength();
        const start = model.getPositionAt(clampOffset(scope.start, length));
        const end = model.getPositionAt(clampOffset(Math.max(scope.start, scope.end - 1), length));
        for (let line = start.lineNumber; line <= end.lineNumber; line += 1) {
            decorations.push({
                range: new monaco.Range(line, 1, line, 1),
                options: { isWholeLine: true, className },
            });
        }
    }

    private syncTasks(tasks: readonly { id: string; from: number; to: number; checked: boolean; position: monaco.IPosition }[]): void {
        const next = new Set(tasks.map((task) => task.id));
        for (const [id, widget] of this.widgets) {
            if (!next.has(id)) {
                this.editor.removeContentWidget(widget);
                this.widgets.delete(id);
            }
        }
        for (const task of tasks) {
            const existing = this.widgets.get(task.id);
            if (existing) {
                const input = existing.getDomNode();
                if (input instanceof HTMLInputElement) {
                    input.checked = task.checked;
                }
                existing.setPosition(task.position);
                this.editor.layoutContentWidget(existing);
                continue;
            }
            const input = document.createElement("input");
            input.type = "checkbox";
            input.className = "inline-md-task";
            input.checked = task.checked;
            input.dataset.from = String(task.from);
            input.dataset.to = String(task.to);
            let fromMouseDown = false;
            input.addEventListener("mousedown", (event) => {
                event.preventDefault();
                event.stopPropagation();
                fromMouseDown = true;
                this.handlers.onToggleTask(task.from, task.to);
            });
            input.addEventListener("click", (event) => {
                event.preventDefault();
                event.stopPropagation();
                if (fromMouseDown) {
                    fromMouseDown = false;
                    return;
                }
                this.handlers.onToggleTask(task.from, task.to);
            });
            const widget = new TaskWidget(task.id, input, task.position);
            this.widgets.set(task.id, widget);
            this.editor.addContentWidget(widget);
        }
    }

    private syncHits(hits: readonly { id: string; text: string; offset: number; position: monaco.IPosition }[]): void {
        const next = new Set(hits.map((hit) => hit.id));
        for (const [id, widget] of this.hits) {
            if (!next.has(id)) {
                this.editor.removeContentWidget(widget);
                this.hits.delete(id);
            }
        }
        for (const hit of hits) {
            const existing = this.hits.get(hit.id);
            if (existing) {
                existing.getDomNode().textContent = hit.text;
                existing.setPosition(hit.position);
                this.editor.layoutContentWidget(existing);
                continue;
            }
            const node = document.createElement("span");
            node.className = "inline-md-code-hit";
            node.textContent = hit.text;
            let fromMouseDown = false;
            const reveal = (event: Event): void => {
                event.preventDefault();
                event.stopPropagation();
                if (fromMouseDown && event.type === "click") {
                    fromMouseDown = false;
                    return;
                }
                fromMouseDown = event.type === "mousedown";
                this.handlers.onReveal(hit.offset);
            };
            node.addEventListener("mousedown", reveal);
            node.addEventListener("click", reveal);
            const widget = new TaskWidget(hit.id, node, hit.position);
            this.hits.set(hit.id, widget);
            this.editor.addContentWidget(widget);
        }
    }

    private scheduleSelectionHeights(): void {
        if (this.selectionFrame !== 0) {
            return;
        }
        this.selectionFrame = requestAnimationFrame(() => {
            this.selectionFrame = 0;
            this.applySelectionHeights();
        });
    }

    private applySelectionHeights(): void {
        const dom = this.editor.getDomNode();
        if (!dom) {
            return;
        }
        const pieces = [...dom.querySelectorAll<HTMLElement>(".selected-text")];
        const viewLines = [...dom.querySelectorAll<HTMLElement>(".view-lines .view-line")];
        const boxes = pieces.map((piece) => {
            const rect = piece.getBoundingClientRect();
            return {
                top: rect.top,
                height: rect.height,
                styleTop: piece.style.top,
                styleBottom: piece.style.bottom,
                styleHeight: piece.style.height,
            };
        });
        const lines = viewLines.map((viewLine) => {
            const rect = viewLine.getBoundingClientRect();
            return {
                top: rect.top,
                height: rect.height,
                stretchToLineHeight: stretchesSelectionLine(viewLine),
            };
        });
        layoutSelectionPieces(boxes, lines);
        pieces.forEach((piece, index) => {
            const box = boxes[index];
            if (!box) {
                return;
            }
            if (piece.style.top !== box.styleTop) {
                piece.style.top = box.styleTop;
            }
            if (piece.style.bottom !== box.styleBottom) {
                piece.style.bottom = box.styleBottom;
            }
            if (piece.style.height !== box.styleHeight) {
                piece.style.height = box.styleHeight;
            }
        });
    }

    private syncCurrentLine(headingLines: ReadonlyMap<number, number>, fontSize: number, lineHeight: number): void {
        const root = this.editor.getDomNode()?.closest(".inline-md-root");
        if (!(root instanceof HTMLElement)) {
            return;
        }
        const cursorLine = this.editor.getPosition()?.lineNumber;
        const level = cursorLine === undefined ? undefined : headingLines.get(cursorLine);
        const extra = level === undefined ? 0 : headingExtraHeight(level, fontSize, lineHeight);
        if (extra > 0) {
            root.style.setProperty("--ib-md-current-line", `${lineHeight + extra}px`);
            root.classList.add("inline-md-current-heading");
            return;
        }
        root.style.removeProperty("--ib-md-current-line");
        root.classList.remove("inline-md-current-heading");
    }

    private syncZones(zones: readonly ZoneRecord[]): void {
        const key = zones.map((zone) => zone.key).join("|");
        if (key === this.zoneKey) {
            return;
        }
        this.zoneKey = key;
        const nextKeys = new Set(zones.map((zone) => zone.key));
        this.editor.changeViewZones((accessor) => {
            const previous = new Map(this.zones.map((zone) => [zone.key, zone]));
            for (const zone of this.zones) {
                if (!nextKeys.has(zone.key) && zone.id) {
                    accessor.removeZone(zone.id);
                }
            }
            this.zones = zones.map((zone) => {
                const existing = previous.get(zone.key);
                if (existing?.id && existing.zone.domNode === zone.zone.domNode) {
                    const line = zone.zone.afterLineNumber;
                    const height = zone.zone.heightInPx;
                    const moved = existing.placedAfter !== line || (
                        existing.placedHeight !== undefined && existing.placedHeight !== height
                    );
                    existing.zone.afterLineNumber = line;
                    if (height !== undefined) {
                        existing.zone.heightInPx = height;
                    }
                    if (moved) {
                        accessor.layoutZone(existing.id);
                    }
                    existing.placedAfter = line;
                    existing.placedHeight = height;
                    return existing;
                }
                if (existing?.id) {
                    accessor.removeZone(existing.id);
                }
                const id = accessor.addZone(zone.zone);
                return {
                    ...zone,
                    id,
                    placedAfter: zone.zone.afterLineNumber,
                    placedHeight: zone.zone.heightInPx,
                };
            });
        });
    }
}
