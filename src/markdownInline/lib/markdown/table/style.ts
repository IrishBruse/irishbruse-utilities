import * as monaco from "monaco-editor/editor/editor.api";
import type { Scope, TextRange } from "../../document/types";

export const tableSourceClass = "inline-md-table-source";

const INLINE_CELL = new Set<Scope["kind"]>([
    "strong",
    "emphasis",
    "strikethrough",
    "inlineCode",
    "link",
]);

function contentClass(scope: Scope): string | undefined {
    switch (scope.kind) {
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

function caretIn(x: number, y: number): { node: Node; offset: number } | undefined {
    const doc = document as Document & {
        caretPositionFromPoint?(x: number, y: number): { offsetNode: Node; offset: number } | null;
        caretRangeFromPoint?(x: number, y: number): Range | null;
    };
    const position = doc.caretPositionFromPoint?.(x, y);
    if (position) {
        return { node: position.offsetNode, offset: position.offset };
    }
    const range = doc.caretRangeFromPoint?.(x, y);
    if (!range) {
        return undefined;
    }
    return { node: range.startContainer, offset: range.startOffset };
}

function sourceOffsetAt(node: Node, offset: number): number | undefined {
    const element = node instanceof Element ? node : node.parentElement;
    const marked = element?.closest("[data-from]");
    if (!(marked instanceof HTMLElement)) {
        return undefined;
    }
    const from = Number(marked.dataset.from);
    if (!Number.isFinite(from)) {
        return undefined;
    }
    return from + offset;
}

export function tableCellOffset(event: MouseEvent, cell: HTMLElement, fallback: number): number {
    const start = Number(cell.dataset.start);
    const end = Number(cell.dataset.end);
    const caret = caretIn(event.clientX, event.clientY);
    const fromCaret =
        caret && cell.contains(caret.node) ? sourceOffsetAt(caret.node, caret.offset) : undefined;
    if (
        fromCaret !== undefined &&
        Number.isFinite(start) &&
        Number.isFinite(end) &&
        fromCaret >= start &&
        fromCaret <= end
    ) {
        return fromCaret;
    }
    if (Number.isFinite(start)) {
        return start;
    }
    return fallback;
}

function appendFormatted(
    parent: HTMLElement,
    source: string,
    start: number,
    end: number,
    scopes: readonly Scope[],
): void {
    const relevant = scopes
        .filter((scope) => INLINE_CELL.has(scope.kind) && scope.start >= start && scope.end <= end)
        .sort((left, right) => left.start - right.start || right.end - left.end);
    let cursor = start;
    while (cursor < end) {
        const next = relevant.find((scope) => scope.start >= cursor);
        const plainEnd = next && next.start < end ? next.start : end;
        if (plainEnd > cursor) {
            const text = document.createElement("span");
            text.dataset.from = String(cursor);
            text.textContent = source.slice(cursor, plainEnd);
            parent.append(text);
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
        if (next.kind === "link" && next.url) {
            node.dataset.href = next.url;
        }
        appendFormatted(node, source, next.contentStart, next.contentEnd, scopes);
        parent.append(node);
        cursor = next.end > cursor ? next.end : cursor + 1;
    }
}

export type TableAlign = "left" | "center" | "right";

export function tableAlignments(source: string, start: number, end: number): TableAlign[] {
    const lines = source.slice(start, end).split(/\r?\n/);
    for (const line of lines) {
        const parts = line
            .split("|")
            .map((cell) => cell.trim())
            .filter((cell) => cell.length > 0);
        if (parts.length === 0 || !parts.every((cell) => /^:?-+:?$/.test(cell))) {
            continue;
        }
        return parts.map((cell) => {
            const left = cell.startsWith(":");
            const right = cell.endsWith(":");
            if (left && right) {
                return "center";
            }
            if (right) {
                return "right";
            }
            return "left";
        });
    }
    return [];
}

function alignClass(align: TableAlign | undefined): string {
    if (align === "center" || align === "right") {
        return `inline-md-align-${align}`;
    }
    return "";
}

export function tableRow(
    source: string,
    scopes: readonly Scope[],
    cells: readonly TextRange[],
    cellTag: "th" | "td",
    aligns: readonly TableAlign[] = [],
): HTMLTableRowElement {
    const row = document.createElement("tr");
    cells.forEach((cell, index) => {
        const node = document.createElement(cellTag);
        const trimmed = trimmedTextRange(source, cell);
        node.dataset.start = String(trimmed.start);
        node.dataset.end = String(trimmed.end);
        const className = alignClass(aligns[index]);
        if (className) {
            node.className = className;
        }
        appendFormatted(node, source, trimmed.start, trimmed.end, scopes);
        row.append(node);
    });
    return row;
}

function ruleRow(columns: number): HTMLTableRowElement {
    const row = document.createElement("tr");
    row.className = "inline-md-table-rule";
    for (let index = 0; index < columns; index += 1) {
        row.append(document.createElement("td"));
    }
    return row;
}

export interface TableOverlayRecord {
    readonly key: string;
    readonly domNode: HTMLElement;
}

export interface TableZoneHost {
    onReveal: (offset: number) => void;
    onLink?: (href: string) => void;
}

export function tableZone(
    scope: Scope,
    source: string,
    scopes: readonly Scope[],
    from: number,
    host: TableZoneHost,
): TableOverlayRecord {
    const frame = document.createElement("div");
    frame.className = "inline-md-table";
    frame.addEventListener("mousedown", (event) => {
        const element =
            event.target instanceof Element
                ? event.target
                : event.target instanceof Node
                  ? event.target.parentElement
                  : null;
        const link = element?.closest(".inline-md-link");
        const href = link instanceof HTMLElement ? link.dataset.href : undefined;
        event.preventDefault();
        event.stopPropagation();
        if (href && host.onLink) {
            host.onLink(href);
            return;
        }
        const cell = element?.closest("td, th");
        const offset =
            cell instanceof HTMLElement ? tableCellOffset(event, cell, from + 1) : from + 1;
        host.onReveal(offset);
    });
    const table = document.createElement("table");
    const rows = scope.rows ?? [];
    const aligns = tableAlignments(source, scope.start, scope.end);
    const head = rows[0];
    const columns = Math.max(head?.length ?? 0, ...rows.map((row) => row.length));
    if (head) {
        const thead = document.createElement("thead");
        thead.append(tableRow(source, scopes, head, "th", aligns));
        table.append(thead);
    }
    if (columns > 0) {
        const tbody = document.createElement("tbody");
        tbody.append(ruleRow(columns));
        for (const cells of rows.slice(1)) {
            tbody.append(tableRow(source, scopes, cells, "td", aligns));
        }
        table.append(tbody);
    }
    frame.append(table);
    const key = `table:${scope.start}:${scope.end}:${source.slice(scope.start, scope.end)}`;
    return { key, domNode: frame };
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
        private readonly onMeasure: (
            lines: readonly number[],
            heights: ReadonlyMap<number, number>,
        ) => void,
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
        const rows = [...table.rows].filter(
            (row) => !row.classList.contains("inline-md-table-rule"),
        );
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
                (Number.parseFloat(style.paddingLeft) || 0) +
                    (Number.parseFloat(style.paddingRight) || 0) +
                    (Number.parseFloat(style.borderLeftWidth) || 0) +
                    (Number.parseFloat(style.borderRightWidth) || 0),
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
                const word = text
                    .split(/\s+/)
                    .reduce(
                        (wide, part) => Math.max(wide, part.length > 0 ? textWidth(part) : 0),
                        0,
                    );
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
            const widest = maxWidths.reduce(
                (best, width, index) => (width > (maxWidths[best] ?? 0) ? index : best),
                0,
            );
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
            const cells = [...row.children].filter(
                (cell): cell is HTMLElement => cell instanceof HTMLElement,
            );
            for (const cell of cells) {
                cell.style.height = "auto";
            }
            const content = Math.max(
                lineHeight,
                ...cells.map((cell) => Math.ceil(cell.scrollHeight)),
            );
            const applied = this.scaleFor(line);
            const rendered = Math.max(
                lineHeight,
                this.editor.getBottomForLineNumber(line) - this.editor.getTopForLineNumber(line),
            );
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

export { TableOverlayWidget as createTableOverlayWidget };
