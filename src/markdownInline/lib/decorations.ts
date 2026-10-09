import * as monaco from "monaco-editor/editor/editor.api";
import { blockquoteContentIndex, blockquoteDepthClass, blockquoteLineDepth, blockquoteWrapIndentColumns } from "./preview/blockquote";
import { applyHeadingFontScales, headingLineHeightMultiplier, headingSelectionPadPx } from "./headingLayout";
import { listGapPaints, listLineHeightMultiplier, listMarkerIsTask, monacoLineModel } from "./preview/listItemGap";
import { blockZone as buildBlockZone, createMermaidZone as buildMermaidZone, headingLevel, imageZoneKey, tableZone as buildTableZone, type BlockZoneHost } from "./preview/blockZone";
import { mermaidDiagramSource } from "../../lib/mermaid/mermaidDiagramSource";
import { isMermaidCodeBlock } from "./preview/mermaid";
import { previewContentClass, previewContentRange } from "./preview/paint";
import { refreshMermaidCodeLens, setHiddenAreas } from "./monaco";
import { rawGhostClass, rawHeadingBounds, rawHeadingClass, rawLinkSpans } from "./raw/paint";
import { reveal, revealCode, showFormatted } from "./reveal";
import { parseScopes } from "./document/scopes";
import { clipSelectionToText, extendHeadingSelectionPastText, layoutSelectionPieces, selectionHeadingSelector, stretchesSelectionLine } from "./selection";
import { readFrontMatter, skillDirectoryName, skillFrontMatterIssues, type FrontMatterSpan } from "./skill";
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

class YamlLabelWidget implements monaco.editor.IContentWidget {
    readonly allowEditorOverflow = false;
    readonly suppressMouseDown = true;
    private lineNumber = 1;
    private readonly node: HTMLElement;

    constructor() {
        const node = document.createElement("span");
        node.className = "inline-md-lang";
        node.textContent = "yaml";
        this.node = node;
    }

    getId(): string {
        return "inline-md-yaml-label";
    }

    getDomNode(): HTMLElement {
        return this.node;
    }

    getPosition(): monaco.editor.IContentWidgetPosition {
        return {
            position: { lineNumber: this.lineNumber, column: 1 },
            preference: [monaco.editor.ContentWidgetPositionPreference.EXACT],
        };
    }

    setLine(lineNumber: number): void {
        this.lineNumber = lineNumber;
    }

    afterRender(): void {
        const editor = this.node.closest(".monaco-editor");
        const parent = this.node.parentElement;
        if (!(editor instanceof HTMLElement) || !(parent instanceof HTMLElement)) {
            return;
        }
        const nodeBox = this.node.getBoundingClientRect();
        const line = [...editor.querySelectorAll(".view-line")].find((entry) => {
            const box = entry.getBoundingClientRect();
            return nodeBox.top < box.bottom && nodeBox.bottom > box.top;
        });
        if (!(line instanceof HTMLElement)) {
            return;
        }
        const lineBox = line.getBoundingClientRect();
        const parentBox = parent.getBoundingClientRect();
        const width = this.node.offsetWidth;
        this.node.style.transform = "none";
        this.node.style.left = `${lineBox.right - 16 - width - parentBox.left}px`;
        this.node.style.top = `${lineBox.top - parentBox.top}px`;
    }
}

class TableOverlayWidget implements monaco.editor.IContentWidget {
    readonly allowEditorOverflow = false;
    readonly suppressMouseDown = true;
    private lines: readonly number[];

    constructor(
        private readonly id: string,
        private readonly node: HTMLElement,
        lines: readonly number[],
        private readonly editor: monaco.editor.IStandaloneCodeEditor,
        private readonly onMeasure: (lines: readonly number[], heights: ReadonlyMap<number, number>) => void,
        private readonly scaleFor: (line: number) => number,
    ) {
        this.lines = lines;
    }

    getId(): string {
        return `inline-md-table-${this.id.replace(/[^a-zA-Z0-9_-]+/g, "-")}`;
    }

    getDomNode(): HTMLElement {
        return this.node;
    }

    getPosition(): monaco.editor.IContentWidgetPosition {
        return {
            position: { lineNumber: this.lines[0] ?? 1, column: 1 },
            preference: [monaco.editor.ContentWidgetPositionPreference.EXACT],
        };
    }

    setLines(lines: readonly number[]): void {
        this.lines = lines;
    }

    afterRender(): void {
        const editorNode = this.editor.getDomNode();
        const parent = this.node.parentElement;
        if (!(editorNode instanceof HTMLElement) || !(parent instanceof HTMLElement)) {
            return;
        }
        const first = this.lines[0];
        const last = this.lines[this.lines.length - 1];
        if (first === undefined || last === undefined) {
            return;
        }
        const viewLines = editorNode.querySelector(".view-lines");
        if (!(viewLines instanceof HTMLElement)) {
            return;
        }
        const scrollTop = this.editor.getScrollTop();
        const top = this.editor.getTopForLineNumber(first) - scrollTop;
        const editorBox = editorNode.getBoundingClientRect();
        const parentBox = parent.getBoundingClientRect();
        const linesBox = viewLines.getBoundingClientRect();
        const fontSize = this.editor.getOption(monaco.editor.EditorOption.fontSize);
        const lineHeight = this.editor.getOption(monaco.editor.EditorOption.lineHeight);
        this.node.style.left = `${linesBox.left - parentBox.left}px`;
        this.node.style.width = `${Math.max(0, linesBox.width)}px`;
        this.node.style.maxWidth = `${Math.max(0, linesBox.width)}px`;
        this.node.style.top = `${editorBox.top + top - parentBox.top}px`;
        this.node.style.fontSize = `${fontSize}px`;
        this.node.style.lineHeight = `${lineHeight}px`;
        this.fitColumns(Math.max(0, linesBox.width));
        this.fitRows(lineHeight);
    }

    private fitColumns(available: number): void {
        const table = this.node.querySelector("table");
        if (!(table instanceof HTMLTableElement) || available <= 0) {
            return;
        }
        const frameWidth = this.node.style.width;
        const frameMax = this.node.style.maxWidth;
        this.node.style.width = "max-content";
        this.node.style.maxWidth = "none";
        const rows = [...table.rows].filter((row) => !row.classList.contains("inline-md-table-rule"));
        const count = rows.reduce((max, row) => Math.max(max, row.cells.length), 0);
        if (count === 0) {
            this.node.style.width = frameWidth;
            this.node.style.maxWidth = frameMax;
            return;
        }
        const probe = document.createElement("span");
        probe.style.whiteSpace = "nowrap";
        probe.style.position = "absolute";
        probe.style.visibility = "hidden";
        this.node.append(probe);
        const textWidth = (text: string): number => {
            probe.textContent = text;
            return Math.ceil(probe.offsetWidth);
        };
        const pad = (cell: HTMLTableCellElement): number => {
            const style = getComputedStyle(cell);
            return Math.ceil(
                (Number.parseFloat(style.paddingLeft) || 0)
                + (Number.parseFloat(style.paddingRight) || 0)
                + (Number.parseFloat(style.borderLeftWidth) || 0)
                + (Number.parseFloat(style.borderRightWidth) || 0),
            );
        };
        const maxWidths = Array.from({ length: count }, () => 0);
        const minWidths = Array.from({ length: count }, () => 1);
        for (const row of rows) {
            for (let index = 0; index < row.cells.length; index += 1) {
                const cell = row.cells[index];
                if (!cell) {
                    continue;
                }
                const text = cell.innerText.replaceAll("\u00a0", " ").trim();
                const extra = pad(cell);
                const full = text.length > 0 ? textWidth(text) + extra : extra;
                const word = text.split(/\s+/).reduce((wide, part) => Math.max(wide, part.length > 0 ? textWidth(part) : 0), 0);
                maxWidths[index] = Math.max(maxWidths[index] ?? 0, full);
                minWidths[index] = Math.max(minWidths[index] ?? 1, word + extra);
            }
        }
        probe.remove();
        if (maxWidths.every((width) => width <= 1)) {
            this.node.style.width = frameWidth;
            this.node.style.maxWidth = frameMax;
            return;
        }
        this.node.style.width = frameWidth;
        this.node.style.maxWidth = frameMax;
        const sumMax = maxWidths.reduce((sum, width) => sum + width, 0);
        const sizes = maxWidths.slice();
        if (sumMax > available) {
            const widest = maxWidths.reduce((best, width, index) => width > (maxWidths[best] ?? 0) ? index : best, 0);
            const others = sumMax - (maxWidths[widest] ?? 0);
            const floor = minWidths[widest] ?? 1;
            sizes[widest] = Math.max(floor, available - others);
        }
        const total = sizes.reduce((sum, width) => sum + width, 0);
        table.style.tableLayout = "fixed";
        table.style.width = `${Math.max(1, Math.min(available, total))}px`;
        for (const row of table.rows) {
            for (let index = 0; index < row.cells.length; index += 1) {
                const cell = row.cells[index];
                const size = sizes[index];
                const max = maxWidths[index];
                if (!cell || size === undefined || max === undefined) {
                    continue;
                }
                cell.style.width = `${size}px`;
                cell.style.maxWidth = `${size}px`;
                cell.style.whiteSpace = size + 2 < max ? "normal" : "nowrap";
            }
        }
    }

    private fitRows(lineHeight: number): void {
        const rows = [...this.node.querySelectorAll("tr")];
        const heights = new Map<number, number>();
        rows.forEach((row, index) => {
            const line = this.lines[index];
            if (line === undefined || !(row instanceof HTMLElement) || lineHeight <= 0) {
                return;
            }
            row.style.height = "auto";
            const cells = [...row.children].filter((cell): cell is HTMLElement => cell instanceof HTMLElement);
            for (const cell of cells) {
                cell.style.height = "auto";
            }
            const content = Math.max(lineHeight, ...cells.map((cell) => Math.ceil(cell.scrollHeight)));
            const applied = this.scaleFor(line);
            const rendered = Math.max(lineHeight, this.editor.getBottomForLineNumber(line) - this.editor.getTopForLineNumber(line));
            const wraps = Math.max(1, Math.round(rendered / Math.max(1, applied * lineHeight)));
            const natural = wraps * lineHeight;
            const needed = Math.max(natural, content);
            row.style.height = `${needed}px`;
            const scale = Math.round((needed / natural) * 100) / 100;
            if (scale > 1.05) {
                heights.set(line, scale);
            }
        });
        this.onMeasure(this.lines, heights);
    }
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
    private selectionListener: monaco.IDisposable | undefined;
    private selectionFrame = 0;
    private frontMatter: FrontMatterSpan | undefined;
    private yamlLabel: YamlLabelWidget | undefined;
    private readonly mermaidZones = new Map<string, ZoneRecord>();
    private readonly imageZones = new Map<string, ZoneRecord>();
    private mermaidLensKey = "";
    private hiddenLineNumbers = new Set<number>();
    private readonly tableWidgets = new Map<string, TableOverlayWidget>();
    private readonly tableLineHeights = new Map<number, number>();
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
        const tables: { key: string; domNode: HTMLElement; lines: readonly number[] }[] = [];
        const tasks: { id: string; from: number; to: number; checked: boolean; position: monaco.IPosition }[] = [];
        const hits: { id: string; text: string; offset: number; position: monaco.IPosition }[] = [];

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
                    const record = this.tableZone(scope, text, scopes, bounds.start);
                    tables.push({ key: record.key, domNode: record.domNode, lines });
                    const lineHeight = this.editor.getOption(monaco.editor.EditorOption.lineHeight);
                    for (const line of lines) {
                        const scale = this.tableLineHeights.get(line);
                        const options: monaco.editor.IModelDecorationOptions = {
                            isWholeLine: true,
                            className: "inline-md-table-source",
                        };
                        if (scale !== undefined && lineHeight > 0 && scale > 1.05) {
                            options.lineHeight = scale;
                        }
                        decorations.push({
                            range: new monaco.Range(line, 1, line, 1),
                            options,
                        });
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
                        : hideOptions(before),
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
            const sourceLink = scope.kind === "link" && scope.markers.some((marker) => {
                const shown = reveal({
                    scope,
                    marker,
                    cursor,
                    markerLine: markerLineAt(model, marker.start),
                    findHit: findHits(scope, finds),
                    frontMatterEnd: this.frontMatter?.end,
                    singleLine: false,
                });
                return shown.surface === "raw";
            });
            const rawHeading = scope.kind === "heading" && !formatted;
            const className = rawHeading
                ? rawHeadingClass(scope)
                : formatted && !sourceLink
                    ? previewContentClass(scope)
                    : undefined;
            if (className) {
                const range = rawHeading ? rawHeadingBounds(text, scope) : previewContentRange(scope);
                const start = range.start;
                const end = range.end;
                if (end > start) {
                    for (const segment of subtractRanges(start, end, replaced)) {
                        const options: monaco.editor.IModelDecorationOptions = {
                            inlineClassName: className,
                            inlineClassNameAffectsLetterSpacing: scope.kind === "heading",
                        };
                        if (scope.kind === "heading") {
                            const lineHeight = headingLineHeightMultiplier(headingLevel(scope));
                            if (lineHeight !== undefined) {
                                options.lineHeight = lineHeight;
                            }
                        }
                        decorations.push({
                            range: rangeFromOffsets(model, segment.start, segment.end),
                            options,
                        });
                    }
                }
            }
            if (sourceLink) {
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
                if (ghost.surface !== "raw" || !ghost.ghost || scope.kind === "link") {
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

        const lineHeight = this.editor.getOption(monaco.editor.EditorOption.lineHeight);
        const listRoot = this.editor.getDomNode()?.closest(".inline-md-root");
        if (listRoot instanceof HTMLElement) {
            applyHeadingFontScales(listRoot);
        }
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
            const indentColumns = blockquoteWrapIndentColumns(content, model.getOptions().tabSize);
            if (indentColumns > 0 && content.length > 0) {
                decorations.push({
                    range: new monaco.Range(lineNumber, 1, lineNumber, 2),
                    options: {
                        before: {
                            content: " ".repeat(indentColumns),
                            inlineClassName: "inline-md-hidden",
                            inlineClassNameAffectsLetterSpacing: true,
                            cursorStops: monaco.editor.InjectedTextCursorStops.None,
                        },
                    },
                });
            }
        }

        const tabSize = model.getOptions().tabSize;
        const lineModel = monacoLineModel(model);
        const listLineHeight = listLineHeightMultiplier(lineHeight);
        for (const gap of listGapPaints(lineModel, scopes, tabSize)) {
            decorations.push({
                range: new monaco.Range(gap.lineNumber, 1, gap.lineNumber, 1),
                options: {
                    isWholeLine: true,
                    className: gap.className,
                    lineHeight: listLineHeight,
                },
            });
        }

        this.paintFrontMatter(model, decorations);
        this.decorations.set(decorations);
        this.syncTasks(tasks);
        this.syncHits(hits);
        this.syncTables(tables);
        this.syncZones(zones);
        this.scheduleSelectionHeights();
        const mermaidLensKey = scopes
            .filter((scope) => scope.kind === "codeBlock" && isMermaidCodeBlock(scope.language))
            .map((scope) => `${scope.start}:${scope.end}:${mermaidDiagramSource(text.slice(scope.contentStart, scope.contentEnd))}`)
            .join("|");
        if (mermaidLensKey !== this.mermaidLensKey) {
            this.mermaidLensKey = mermaidLensKey;
            refreshMermaidCodeLens();
        }
        this.hiddenLineNumbers = hiddenLines;
        this.writeHiddenAreas(model);
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
        this.syncYamlLabel(undefined);
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
        for (const widget of this.tableWidgets.values()) {
            this.editor.removeContentWidget(widget);
        }
        this.tableWidgets.clear();
        this.tableLineHeights.clear();
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
                if (listMarkerIsTask(scopes, marker.end)) {
                    return undefined;
                }
                return injected("• ", "inline-md-list-mark");
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
        const content = mermaidDiagramSource(source.slice(scope.contentStart, scope.contentEnd));
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
    ) {
        return buildTableZone(scope, source, scopes, from, this.zoneHost());
    }

    private applyTableHeights(lines: readonly number[], heights: ReadonlyMap<number, number>): void {
        let changed = false;
        for (const line of lines) {
            const next = heights.get(line);
            const prev = this.tableLineHeights.get(line);
            if (next === undefined) {
                if (prev !== undefined) {
                    this.tableLineHeights.delete(line);
                    changed = true;
                }
                continue;
            }
            if (prev !== next) {
                this.tableLineHeights.set(line, next);
                changed = true;
            }
        }
        if (changed) {
            this.update();
        }
    }

    private syncTables(tables: readonly { key: string; domNode: HTMLElement; lines: readonly number[] }[]): void {
        const next = new Set(tables.map((table) => table.key));
        for (const [key, widget] of this.tableWidgets) {
            if (!next.has(key)) {
                this.editor.removeContentWidget(widget);
                this.tableWidgets.delete(key);
            }
        }
        for (const table of tables) {
            const existing = this.tableWidgets.get(table.key);
            if (existing) {
                existing.setLines(table.lines);
                this.editor.layoutContentWidget(existing);
                continue;
            }
            const widget = new TableOverlayWidget(
                table.key,
                table.domNode,
                table.lines,
                this.editor,
                (lines, heights) => {
                    this.applyTableHeights(lines, heights);
                },
                (line) => this.tableLineHeights.get(line) ?? 1,
            );
            this.tableWidgets.set(table.key, widget);
            this.editor.addContentWidget(widget);
        }
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
            this.syncYamlLabel(undefined);
            return;
        }
        const length = model.getValueLength();
        const start = model.getPositionAt(0);
        const end = model.getPositionAt(clampOffset(Math.max(0, span.end - 1), length));
        for (let line = start.lineNumber; line <= end.lineNumber; line += 1) {
            decorations.push({
                range: new monaco.Range(line, 1, line, 1),
                options: { isWholeLine: true, className: "inline-md-code-line inline-md-front-matter-line" },
            });
        }
        this.syncYamlLabel(start.lineNumber);
        for (const issue of skillFrontMatterIssues(span.yaml, skillDirectoryName(this.documentUrl))) {
            const from = issue.start < 0 ? 0 : span.yamlStart + issue.start;
            const to = issue.start < 0 ? Math.min(3, length) : span.yamlStart + issue.end;
            const issueStart = model.getPositionAt(clampOffset(from, length));
            const issueEnd = model.getPositionAt(clampOffset(Math.max(from, to), length));
            decorations.push({
                range: new monaco.Range(issueStart.lineNumber, issueStart.column, issueEnd.lineNumber, issueEnd.column),
                options: {
                    inlineClassName: "inline-md-skill-error",
                    after: injected(` ${issue.message}`, "inline-md-skill-error-message"),
                },
            });
        }
    }

    private syncYamlLabel(lineNumber: number | undefined): void {
        if (lineNumber === undefined) {
            if (this.yamlLabel) {
                this.editor.removeContentWidget(this.yamlLabel);
                this.yamlLabel = undefined;
            }
            return;
        }
        if (!this.yamlLabel) {
            this.yamlLabel = new YamlLabelWidget();
            this.editor.addContentWidget(this.yamlLabel);
        }
        this.yamlLabel.setLine(lineNumber);
        this.editor.layoutContentWidget(this.yamlLabel);
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
                left: rect.left,
                width: rect.width,
                height: rect.height,
                styleTop: piece.style.top,
                styleLeft: piece.style.left,
                styleBottom: piece.style.bottom,
                styleHeight: piece.style.height,
                styleWidth: piece.style.width,
                radius: [],
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
        layoutSelectionPieces(boxes.filter((box) => box.width > 12), lines);
        const frontMatterRows = [...dom.querySelectorAll<HTMLElement>(".inline-md-front-matter-line")].map((row) => row.getBoundingClientRect());
        for (const viewLine of viewLines) {
            const bounds = viewLine.getBoundingClientRect();
            const inFrontMatter = frontMatterRows.some((row) => bounds.top < row.bottom - 0.5 && bounds.bottom > row.top + 0.5);
            if (!inFrontMatter) {
                continue;
            }
            let textRight = bounds.left;
            for (const span of viewLine.querySelectorAll("span")) {
                if (span.childElementCount > 0) {
                    continue;
                }
                const text = (span.textContent ?? "").replaceAll("\u00a0", " ").trim();
                if (text.length === 0) {
                    continue;
                }
                textRight = Math.max(textRight, span.getBoundingClientRect().right);
            }
            const newlinePx = this.editor.getOption(monaco.editor.EditorOption.fontInfo).spaceWidth;
            for (const box of boxes) {
                const centerY = box.top + box.height / 2;
                if (centerY < bounds.top || centerY >= bounds.bottom) {
                    continue;
                }
                clipSelectionToText(box, textRight, newlinePx);
            }
            for (const mask of dom.querySelectorAll<HTMLElement>(".cslr.monaco-editor-background")) {
                const rect = mask.getBoundingClientRect();
                const centerY = rect.top + rect.height / 2;
                if (centerY < bounds.top || centerY >= bounds.bottom || rect.left < textRight - 0.5) {
                    continue;
                }
                mask.style.width = "0px";
            }
        }
        const pad = headingSelectionPadPx(this.editor.getOption(monaco.editor.EditorOption.fontSize));
        for (const viewLine of viewLines) {
            const heading = viewLine.querySelector(selectionHeadingSelector);
            if (!(heading instanceof HTMLElement)) {
                continue;
            }
            const bounds = viewLine.getBoundingClientRect();
            const textRight = heading.getBoundingClientRect().right;
            for (const box of boxes) {
                const centerY = box.top + box.height / 2;
                if (centerY < bounds.top || centerY >= bounds.bottom || box.width < 12) {
                    continue;
                }
                extendHeadingSelectionPastText(box, textRight, pad);
            }
        }
        pieces.forEach((piece, index) => {
            const box = boxes[index];
            if (!box) {
                return;
            }
            if (piece.style.top !== box.styleTop) {
                piece.style.top = box.styleTop;
            }
            if (piece.style.left !== box.styleLeft) {
                piece.style.left = box.styleLeft;
            }
            if (piece.style.bottom !== box.styleBottom) {
                piece.style.bottom = box.styleBottom;
            }
            if (piece.style.height !== box.styleHeight) {
                piece.style.height = box.styleHeight;
            }
            if (piece.style.width !== box.styleWidth) {
                piece.style.width = box.styleWidth;
            }
        });
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
