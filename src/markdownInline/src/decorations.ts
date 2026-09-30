import * as monaco from "monaco-editor/esm/vs/editor/editor.api";
import { resolveImageUrl } from "./imageUrl";
import { setHiddenAreas } from "./monacoSetup";
import { parseScopes } from "./scopes";
import type { CursorContext, Scope, TextRange } from "./types";
import { markerVisibility, showsFormattedContent } from "./visibility";

export interface InlinePresentationHandlers {
    onToggleTask(from: number, to: number): void;
    onReveal(offset: number): void;
}

interface ZoneRecord {
    readonly key: string;
    readonly zone: monaco.editor.IViewZone;
    id?: string;
}

class TaskWidget implements monaco.editor.IContentWidget {
    readonly allowEditorOverflow = true;

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
const HEADING_LINE_RATIO = 1.25;

function headingLevel(scope: Scope): number {
    const raw = scope.level ?? 1;
    return raw >= 1 && raw <= 6 ? Math.trunc(raw) : 1;
}

function headingExtraHeight(level: number, fontSize: number, lineHeight: number): number {
    const scale = HEADING_SCALE[level] ?? 1;
    const ink = fontSize * scale * HEADING_LINE_RATIO;
    const leading = Math.max(0, lineHeight - fontSize) * scale;
    return Math.max(0, Math.ceil(ink + leading - lineHeight));
}

const INLINE_CELL = new Set<Scope["kind"]>(["strong", "emphasis", "strikethrough", "inlineCode", "link"]);

function trimmedTextRange(source: string, range: TextRange): TextRange {
    let start = range.start;
    let end = range.end;
    while (start < end && (source[start] === " " || source[start] === "\t")) {
        start += 1;
    }
    while (end > start && (source[end - 1] === " " || source[end - 1] === "\t")) {
        end -= 1;
    }
    return { start, end };
}

function appendFormatted(parent: HTMLElement, source: string, start: number, end: number, scopes: readonly Scope[]): void {
    const relevant = scopes
        .filter((scope) => INLINE_CELL.has(scope.kind) && scope.start >= start && scope.end <= end)
        .sort((left, right) => left.start - right.start || right.end - left.end);
    let cursor = start;
    while (cursor < end) {
        const next = relevant.find((scope) => scope.start >= cursor);
        const plainEnd = next && next.start < end ? next.start : end;
        if (plainEnd > cursor) {
            parent.append(document.createTextNode(source.slice(cursor, plainEnd)));
            cursor = plainEnd;
        }
        if (!next || next.start >= end) {
            break;
        }
        const node = document.createElement("span");
        const className = contentClass(next);
        if (className) {
            node.className = className;
        }
        appendFormatted(node, source, next.contentStart, next.contentEnd, scopes);
        parent.append(node);
        cursor = next.end > cursor ? next.end : cursor + 1;
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

function contentClass(scope: Scope): string | undefined {
    switch (scope.kind) {
        case "heading":
            return `inline-md-h${headingLevel(scope)}`;
        case "strong":
            return "inline-md-strong";
        case "emphasis":
            return "inline-md-em";
        case "strikethrough":
            return "inline-md-strike";
        case "inlineCode":
            return "inline-md-code";
        case "link":
            return "inline-md-link";
        default:
            return undefined;
    }
}

function listMarkerIsTask(scopes: readonly Scope[], marker: TextRange): boolean {
    return scopes.some((scope) => scope.kind === "task" && scope.start === marker.end);
}

function lineClass(scope: Scope): string | undefined {
    if (scope.kind === "blockquote") {
        return "inline-md-quote";
    }
    if (scope.kind === "codeBlock") {
        return "inline-md-code-line";
    }
    return undefined;
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

function lineNumberNode(lineNumber: number): HTMLDivElement {
    const number = document.createElement("div");
    number.className = "inline-md-zone-number";
    number.textContent = String(lineNumber);
    return number;
}

function imageLabel(alt: string): string {
    if (alt.length > 0) {
        return alt;
    }
    return "Image";
}

function fallbackElement(alt: string, from: number, onReveal: (offset: number) => void): HTMLSpanElement {
    const fallback = document.createElement("span");
    fallback.className = "inline-md-image-fallback";
    fallback.textContent = imageLabel(alt);
    fallback.dataset.from = String(from);
    fallback.addEventListener("mousedown", (event) => {
        event.preventDefault();
        event.stopPropagation();
        onReveal(from + 1);
    });
    return fallback;
}

export class InlinePresentation {
    private readonly decorations: monaco.editor.IEditorDecorationsCollection;
    private readonly widgets = new Map<string, TaskWidget>();
    private readonly hits = new Map<string, TaskWidget>();
    private zones: ZoneRecord[] = [];
    private zoneKey = "";
    private headingExtras = new Map<number, number>();
    private selectionObserver: MutationObserver | undefined;
    private selectionFrame = 0;

    constructor(
        private readonly editor: monaco.editor.IStandaloneCodeEditor,
        private readonly documentUrl: string,
        private readonly handlers: InlinePresentationHandlers,
    ) {
        this.decorations = editor.createDecorationsCollection();
    }

    update(): void {
        const model = this.editor.getModel();
        if (!model) {
            return;
        }
        const text = model.getValue();
        const cursor = cursorContext(this.editor, model);
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
                if (markerVisibility(scope, marker, cursor) !== "hidden") {
                    continue;
                }
                const bounds = withoutTrailingLineBreak(text, marker.start, marker.end);
                if (bounds.end <= bounds.start || bounds.start < 0 || bounds.end > text.length) {
                    continue;
                }
                if (replaced.some((range) => spansOverlap(bounds.start, bounds.end, range.start, range.end))) {
                    continue;
                }
                replaced.push(bounds);
                if (scope.kind === "table") {
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
                const line = coveredLine(model, bounds);
                if ((scope.kind === "image" || scope.kind === "thematicBreak") && line !== undefined) {
                    hiddenLines.add(line);
                    zones.push(this.blockZone(scope, bounds.start, line));
                    continue;
                }
                decorations.push({
                    range: rangeFromOffsets(model, bounds.start, bounds.end),
                    options: hideOptions(this.replacement(scope, marker, index, scopes, tasks, model)),
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
            const className = contentClass(scope);
            const formatted = showsFormattedContent(scope, cursor);
            if (className && (formatted || scope.kind === "heading")) {
                const rawHeading = scope.kind === "heading" && !formatted;
                const start = rawHeading ? scope.start : scope.contentStart;
                const end = rawHeading ? withoutTrailingLineBreak(text, scope.start, scope.end).end : scope.contentEnd;
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
                const resource = scope.markers.find((marker) => text[marker.start] === "(");
                const labelEnd = resource?.start ?? scope.end;
                paintInline(decorations, model, text, scope.start, labelEnd, replaced, "inline-md-link-label");
                if (resource) {
                    paintInline(decorations, model, text, resource.start, resource.end, replaced, "inline-md-link-url");
                }
            }
            for (const marker of scope.markers) {
                if (markerVisibility(scope, marker, cursor) !== "ghost") {
                    continue;
                }
                for (const segment of subtractRanges(marker.start, marker.end, replaced)) {
                    decorations.push({
                        range: rangeFromOffsets(model, segment.start, segment.end),
                        options: { inlineClassName: "inline-md-ghost" },
                    });
                }
            }
            this.addLineDecorations(model, scope, decorations);
            if (scope.kind === "codeBlock" && scope.markers.some((marker) => markerVisibility(scope, marker, cursor) === "hidden")) {
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
        this.syncCurrentLine(headingLines, fontSize, lineHeight);
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

        this.headingExtras = headingExtras;
        this.watchSelections();
        this.scheduleSelectionHeights();
        this.decorations.set(decorations);
        this.syncTasks(tasks);
        this.syncHits(hits);
        this.syncZones(zones);
        setHiddenAreas(this.editor, [...hiddenLines].map((lineNumber) => ({
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
        setHiddenAreas(this.editor, []);
        this.selectionObserver?.disconnect();
        this.selectionObserver = undefined;
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
                if (listMarkerIsTask(scopes, marker)) {
                    return undefined;
                }
                return injected("• ", "inline-md-bullet");
            case "task": {
                const position = model.getPositionAt(clampOffset(marker.start, model.getValueLength()));
                tasks.push({
                    id: `task-${marker.start}-${marker.end}`,
                    from: marker.start,
                    to: marker.end,
                    checked: scope.checked === true,
                    position,
                });
                return injected(scope.checked === true ? "☑ " : "☐ ", "inline-md-task-spacer");
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

    private blockZone(scope: Scope, from: number, lineNumber: number): ZoneRecord {
        if (scope.kind === "thematicBreak") {
            const rule = document.createElement("hr");
            rule.className = "inline-md-hr";
            return {
                key: `hr:${from}`,
                zone: {
                    afterLineNumber: lineNumber - 1,
                    heightInPx: 28,
                    domNode: rule,
                    marginDomNode: lineNumberNode(lineNumber),
                    suppressMouseDown: true,
                    showInHiddenAreas: true,
                },
            };
        }
        const alt = scope.alt ?? "";
        const src = scope.url ? resolveImageUrl(scope.url, this.documentUrl) : undefined;
        const frame = document.createElement("div");
        frame.className = "inline-md-block";
        const zone: monaco.editor.IViewZone = {
            afterLineNumber: lineNumber - 1,
            heightInPx: src ? 48 : 28,
            domNode: frame,
            marginDomNode: lineNumberNode(lineNumber),
            suppressMouseDown: true,
            showInHiddenAreas: true,
        };
        if (!src) {
            frame.append(fallbackElement(alt, from, this.handlers.onReveal));
            return { key: `image:${from}:missing`, zone };
        }
        const image = document.createElement("img");
        image.className = "inline-md-image";
        image.alt = alt;
        image.dataset.from = String(from);
        image.addEventListener("mousedown", (event) => {
            event.preventDefault();
            event.stopPropagation();
            this.handlers.onReveal(from + 1);
        });
        image.addEventListener("error", () => {
            image.replaceWith(fallbackElement(alt, from, this.handlers.onReveal));
            zone.heightInPx = 28;
            this.layoutZone(`image:${from}:${src}`);
        });
        image.addEventListener("load", () => {
            const height = image.getBoundingClientRect().height;
            if (height > 0) {
                zone.heightInPx = Math.min(height, 240);
                this.layoutZone(`image:${from}:${src}`);
            }
        });
        image.src = src;
        frame.append(image);
        return { key: `image:${from}:${src}`, zone };
    }

    private tableZone(
        scope: Scope,
        source: string,
        scopes: readonly Scope[],
        from: number,
        lineNumber: number,
    ): ZoneRecord {
        const frame = document.createElement("div");
        frame.className = "inline-md-table";
        frame.addEventListener("mousedown", (event) => {
            event.preventDefault();
            event.stopPropagation();
            this.handlers.onReveal(from + 1);
        });
        const table = document.createElement("table");
        const rows = scope.rows ?? [];
        const head = rows[0];
        if (head) {
            const thead = document.createElement("thead");
            thead.append(this.tableRow(source, scopes, head, "th"));
            table.append(thead);
        }
        const bodyRows = rows.slice(1);
        if (bodyRows.length > 0) {
            const tbody = document.createElement("tbody");
            for (const cells of bodyRows) {
                tbody.append(this.tableRow(source, scopes, cells, "td"));
            }
            table.append(tbody);
        }
        frame.append(table);
        const key = `table:${scope.start}:${scope.end}`;
        const zone: monaco.editor.IViewZone = {
            afterLineNumber: lineNumber - 1,
            heightInPx: Math.max(28, rows.length * 32),
            domNode: frame,
            marginDomNode: lineNumberNode(lineNumber),
            suppressMouseDown: true,
            showInHiddenAreas: true,
            onDomNodeTop: () => {
                const measured = Math.ceil(frame.getBoundingClientRect().height);
                if (measured > 0 && Math.abs(measured - (zone.heightInPx ?? 0)) > 1) {
                    zone.heightInPx = measured;
                    this.layoutZone(key);
                }
            },
        };
        return { key, zone };
    }

    private tableRow(
        source: string,
        scopes: readonly Scope[],
        cells: readonly TextRange[],
        cellTag: "th" | "td",
    ): HTMLTableRowElement {
        const row = document.createElement("tr");
        for (const cell of cells) {
            const node = document.createElement(cellTag);
            const trimmed = trimmedTextRange(source, cell);
            appendFormatted(node, source, trimmed.start, trimmed.end, scopes);
            row.append(node);
        }
        return row;
    }

    private layoutZone(key: string): void {
        const record = this.zones.find((zone) => zone.key === key);
        if (!record?.id) {
            return;
        }
        this.editor.changeViewZones((accessor) => {
            if (record.id) {
                accessor.layoutZone(record.id);
            }
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

    private watchSelections(): void {
        if (this.selectionObserver) {
            return;
        }
        const overlays = this.editor.getDomNode()?.querySelector(".view-overlays");
        if (!overlays) {
            return;
        }
        this.selectionObserver = new MutationObserver(() => {
            this.scheduleSelectionHeights();
        });
        this.selectionObserver.observe(overlays, { childList: true, subtree: true });
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
        if (!dom || this.headingExtras.size === 0) {
            return;
        }
        const pieces = dom.querySelectorAll<HTMLElement>(".selected-text");
        if (pieces.length === 0) {
            return;
        }
        const editorTop = dom.getBoundingClientRect().top;
        const lineHeight = this.editor.getOption(monaco.editor.EditorOption.lineHeight);
        const targets: { top: number; height: number }[] = [];
        for (const [lineNumber, extra] of this.headingExtras) {
            const visible = this.editor.getScrolledVisiblePosition({ lineNumber, column: 1 });
            if (!visible) {
                continue;
            }
            targets.push({ top: visible.top, height: lineHeight + extra });
        }
        for (const piece of pieces) {
            const top = piece.getBoundingClientRect().top - editorTop;
            const match = targets.find((target) => Math.abs(target.top - top) < 2);
            if (!match) {
                continue;
            }
            piece.style.bottom = "auto";
            piece.style.height = `${match.height}px`;
        }
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
        this.editor.changeViewZones((accessor) => {
            for (const zone of this.zones) {
                if (zone.id) {
                    accessor.removeZone(zone.id);
                }
            }
            this.zones = zones.map((zone) => {
                const id = accessor.addZone(zone.zone);
                return { ...zone, id };
            });
        });
    }
}
