import * as monaco from "monaco-editor/esm/vs/editor/editor.api";
import { resolveImageUrl } from "./imageUrl";
import { renderMermaidDiagram } from "./mermaid";
import type { Scope, TextRange } from "./types";

export interface BlockZoneHost {
    onReveal(offset: number): void;
    onLink?: (href: string) => void;
    onOpenMermaidPreview?: (openLine: number) => void;
    onLayout(key: string): void;
    documentUrl: string;
    lineHeight: number;
}

export interface BlockZoneRecord {
    readonly key: string;
    readonly zone: monaco.editor.IViewZone;
}

const INLINE_CELL = new Set<Scope["kind"]>(["strong", "emphasis", "strikethrough", "inlineCode", "link"]);

export function headingLevel(scope: Scope): number {
    const raw = scope.level ?? 1;
    return raw >= 1 && raw <= 6 ? Math.trunc(raw) : 1;
}

export function contentClass(scope: Scope): string | undefined {
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
    const fromCaret = caret && cell.contains(caret.node) ? sourceOffsetAt(caret.node, caret.offset) : undefined;
    if (fromCaret !== undefined && Number.isFinite(start) && Number.isFinite(end) && fromCaret >= start && fromCaret <= end) {
        return fromCaret;
    }
    if (Number.isFinite(start)) {
        return start;
    }
    return fallback;
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

function tableFrameHeight(frame: HTMLElement): number {
    const table = frame.querySelector("table");
    const content = table instanceof HTMLElement ? table.offsetHeight : frame.scrollHeight;
    const style = getComputedStyle(frame);
    const padding = (Number.parseFloat(style.paddingTop) || 0) + (Number.parseFloat(style.paddingBottom) || 0);
    const border = (Number.parseFloat(style.borderTopWidth) || 0) + (Number.parseFloat(style.borderBottomWidth) || 0);
    return Math.ceil(content + padding + border);
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

export function blockZone(scope: Scope, from: number, lineNumber: number, host: BlockZoneHost): BlockZoneRecord {
    if (scope.kind === "thematicBreak") {
        const frame = document.createElement("div");
        frame.className = "inline-md-hr-line";
        const rule = document.createElement("hr");
        rule.className = "inline-md-hr";
        frame.append(rule);
        frame.addEventListener("mousedown", (event) => {
            event.preventDefault();
            event.stopPropagation();
            host.onReveal(from + 1);
        });
        return {
            key: `hr:${from}`,
            zone: {
                afterLineNumber: lineNumber - 1,
                heightInPx: host.lineHeight,
                domNode: frame,
                marginDomNode: lineNumberNode(lineNumber),
                suppressMouseDown: true,
                showInHiddenAreas: true,
            },
        };
    }
    const alt = scope.alt ?? "";
    const src = scope.url ? resolveImageUrl(scope.url, host.documentUrl) : undefined;
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
        frame.append(fallbackElement(alt, from, host.onReveal));
        return { key: `image:${from}:missing`, zone };
    }
    const image = document.createElement("img");
    image.className = "inline-md-image";
    image.alt = alt;
    image.dataset.from = String(from);
    image.addEventListener("mousedown", (event) => {
        event.preventDefault();
        event.stopPropagation();
        host.onReveal(from + 1);
    });
    image.addEventListener("error", () => {
        image.replaceWith(fallbackElement(alt, from, host.onReveal));
        zone.heightInPx = 28;
        host.onLayout(`image:${from}:${src}`);
    });
    const fitImage = (): void => {
        const displayed = image.getBoundingClientRect().height;
        const height = displayed > 0 ? displayed : image.naturalHeight;
        if (height <= 0) {
            return;
        }
        const next = Math.min(Math.ceil(height), 240);
        if (Math.abs(next - (zone.heightInPx ?? 0)) <= 1) {
            return;
        }
        zone.heightInPx = next;
        host.onLayout(`image:${from}:${src}`);
    };
    image.addEventListener("load", () => {
        fitImage();
        requestAnimationFrame(fitImage);
    });
    image.src = src;
    frame.append(image);
    return { key: `image:${from}:${src}`, zone };
}

export function createMermaidZone(
    scope: Scope,
    content: string,
    key: string,
    lineNumber: number,
    host: BlockZoneHost,
): BlockZoneRecord {
    const openLine = lineNumber - 1;
    const frame = document.createElement("div");
    frame.className = "inline-md-mermaid";
    const openPreview = document.createElement("button");
    openPreview.type = "button";
    openPreview.className = "inline-md-mermaid-open-preview";
    openPreview.textContent = "Open Preview";
    openPreview.title = "Open Mermaid preview";
    openPreview.addEventListener("mousedown", (event) => {
        event.preventDefault();
        event.stopPropagation();
        host.onOpenMermaidPreview?.(openLine);
    });
    frame.addEventListener("mousedown", (event) => {
        if (event.target instanceof HTMLElement && event.target.closest(".inline-md-mermaid-open-preview")) {
            return;
        }
        event.preventDefault();
        event.stopPropagation();
        host.onReveal(scope.contentStart + 1);
    });
    const diagram = document.createElement("div");
    diagram.className = "inline-md-mermaid-diagram";
    frame.append(diagram);
    const zone: monaco.editor.IViewZone = {
        afterLineNumber: lineNumber - 1,
        heightInPx: 120,
        domNode: frame,
        marginDomNode: lineNumberNode(lineNumber),
        suppressMouseDown: true,
        showInHiddenAreas: true,
    };
    const fitZoneHeight = (): void => {
        if (!frame.isConnected) {
            return;
        }
        const measured = Math.ceil(frame.scrollHeight);
        if (measured > 0 && Math.abs(measured - (zone.heightInPx ?? 0)) > 1) {
            zone.heightInPx = measured;
            host.onLayout(key);
        }
    };
    void renderMermaidDiagram(diagram, content).then((height) => {
        if (!frame.isConnected || height <= 0) {
            return;
        }
        zone.heightInPx = height;
        requestAnimationFrame(fitZoneHeight);
    });
    return { key, zone };
}

export function tableRow(
    source: string,
    scopes: readonly Scope[],
    cells: readonly TextRange[],
    cellTag: "th" | "td",
): HTMLTableRowElement {
    const row = document.createElement("tr");
    for (const cell of cells) {
        const node = document.createElement(cellTag);
        const trimmed = trimmedTextRange(source, cell);
        node.dataset.start = String(trimmed.start);
        node.dataset.end = String(trimmed.end);
        appendFormatted(node, source, trimmed.start, trimmed.end, scopes);
        row.append(node);
    }
    return row;
}

export function tableZone(
    scope: Scope,
    source: string,
    scopes: readonly Scope[],
    from: number,
    lineNumber: number,
    host: BlockZoneHost,
): BlockZoneRecord {
    const frame = document.createElement("div");
    frame.className = "inline-md-table";
    frame.addEventListener("mousedown", (event) => {
        const element = event.target instanceof Element
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
        const offset = cell instanceof HTMLElement
            ? tableCellOffset(event, cell, from + 1)
            : from + 1;
        host.onReveal(offset);
    });
    const table = document.createElement("table");
    const rows = scope.rows ?? [];
    const head = rows[0];
    if (head) {
        const thead = document.createElement("thead");
        thead.append(tableRow(source, scopes, head, "th"));
        table.append(thead);
    }
    const bodyRows = rows.slice(1);
    if (bodyRows.length > 0) {
        const tbody = document.createElement("tbody");
        for (const cells of bodyRows) {
            tbody.append(tableRow(source, scopes, cells, "td"));
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
            const fit = (): void => {
                const measured = tableFrameHeight(frame);
                if (measured > 0 && Math.abs(measured - (zone.heightInPx ?? 0)) > 1) {
                    zone.heightInPx = measured;
                    host.onLayout(key);
                }
            };
            if (frame.style.display === "none") {
                requestAnimationFrame(fit);
                return;
            }
            fit();
        },
    };
    return { key, zone };
}
