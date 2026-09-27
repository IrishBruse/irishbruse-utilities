import { highlightMarkdownSource, lineNumberText, type MarkdownSourceKind } from "./markdownSourceHighlight";
import {
    presentEdit,
    presentSelection,
    type ActiveBlockSource,
    type MarkdownEdit,
    type SourceSelection,
} from "./sourceInspector";

export interface SourceInspector {
    showDocument(text: string): void;
    showSelection(selection: SourceSelection | undefined): void;
    showEdit(edit: MarkdownEdit): void;
}

/** Live raw-markdown pane: document text, active-block source, and the last preview edit. */
export function mountSourceInspector(root: HTMLElement): SourceInspector {
    const selectionLabel = requireElement<HTMLElement>(root, "#source-selection-label");
    const selectionBlocks = requireElement<HTMLElement>(root, "#source-selection-blocks");
    const editLabel = requireElement<HTMLElement>(root, "#source-edit-label");
    const editDeletedLabel = requireElement<HTMLElement>(root, "#source-edit-deleted-label");
    const editDeleted = requireElement<HTMLElement>(root, "#source-edit-deleted");
    const editInsertedLabel = requireElement<HTMLElement>(root, "#source-edit-inserted-label");
    const editInserted = requireElement<HTMLElement>(root, "#source-edit-inserted");
    const scroller = requireElement<HTMLElement>(root, "#source-scroller");
    const gutter = requireElement<HTMLPreElement>(root, "#source-gutter");
    const source = requireElement<HTMLPreElement>(root, "#source-text");
    const caret = requireElement<HTMLElement>(root, "#source-caret");

    const gutterNode = document.createTextNode("");
    gutter.append(gutterNode);
    const textNode = document.createTextNode("");
    source.insertBefore(textNode, caret);

    const highlights = createHighlights();
    let text = "";
    let paintKey = "";
    let caretFrame = 0;

    return {
        showDocument(next: string): void {
            text = next;
            highlights?.edit.clear();
            textNode.data = next;
            gutterNode.data = lineNumberText(next);
            paintSyntax(textNode, next, highlights?.syntax);
            paintKey = "";
            caret.hidden = true;
        },
        showSelection(selection: SourceSelection | undefined): void {
            const key = selection ? `${text.length}:${selection.anchor}:${selection.active}` : `none:${text.length}`;
            if (key === paintKey) {
                return;
            }
            paintKey = key;
            const presentation = presentSelection(text, selection);
            selectionLabel.textContent = presentation.label;
            renderActiveBlocks(selectionBlocks, presentation.blocks);
            caret.hidden = true;
            const revealAt = presentation.caret ?? selection?.active;
            cancelAnimationFrame(caretFrame);
            caretFrame = requestAnimationFrame(() => {
                if (revealAt !== undefined) {
                    revealOffset(scroller, textNode, revealAt);
                }
            });
        },
        showEdit(edit: MarkdownEdit): void {
            const presentation = presentEdit(edit);
            editLabel.textContent = presentation.label;
            setExcerpt(editDeleted, presentation.deleted);
            editDeletedLabel.hidden = presentation.deleted.length === 0;
            setExcerpt(editInserted, presentation.inserted);
            editInsertedLabel.hidden = presentation.inserted.length === 0;
            if (presentation.insertedRange) {
                paintHighlight(
                    highlights?.edit,
                    textNode,
                    presentation.insertedRange.start,
                    presentation.insertedRange.endExclusive,
                );
            } else {
                highlights?.edit.clear();
            }
        },
    };
}

function requireElement<T extends HTMLElement>(root: HTMLElement, selector: string): T {
    const element = root.querySelector<T>(selector);
    if (!element) {
        throw new Error(`Source inspector element ${selector} was not found`);
    }
    return element;
}

function setExcerpt(element: HTMLElement, text: string): void {
    element.textContent = text;
    element.hidden = text.length === 0;
}

function renderActiveBlocks(container: HTMLElement, blocks: readonly ActiveBlockSource[]): void {
    container.replaceChildren();
    container.hidden = blocks.length === 0;
    for (const block of blocks) {
        const card = document.createElement("div");
        card.className = "source-active-block";

        const label = document.createElement("p");
        label.className = "source-active-block-label";
        label.textContent = `${formatBlockKind(block.kind)} · offsets ${block.range.start} to ${block.range.endExclusive}`;

        const source = document.createElement("pre");
        source.className = "source-active-block-source";
        source.textContent = block.source;

        card.append(label, source);
        container.append(card);
    }
}

function formatBlockKind(kind: string): string {
    const words = kind.replace(/([A-Z])/g, " $1").trim();
    return words.charAt(0).toUpperCase() + words.slice(1);
}

const SYNTAX_KINDS: readonly MarkdownSourceKind[] = ["heading", "bold", "italic", "code", "linkLabel", "link"];

function createHighlights():
    | { edit: Highlight; syntax: ReadonlyMap<MarkdownSourceKind, Highlight> }
    | undefined {
    if (!("highlights" in CSS) || !CSS.highlights) {
        return undefined;
    }
    const syntax = new Map<MarkdownSourceKind, Highlight>();
    for (const kind of SYNTAX_KINDS) {
        const highlight = new Highlight();
        syntax.set(kind, highlight);
        CSS.highlights.set(syntaxHighlightName(kind), highlight);
    }
    const edit = new Highlight();
    CSS.highlights.set("md-source-edit", edit);
    return { edit, syntax };
}

function syntaxHighlightName(kind: MarkdownSourceKind): string {
    return kind === "linkLabel" ? "md-source-link-label" : `md-source-${kind}`;
}

function paintSyntax(
    node: Text,
    text: string,
    syntax: ReadonlyMap<MarkdownSourceKind, Highlight> | undefined,
): void {
    if (!syntax) {
        return;
    }
    for (const highlight of syntax.values()) {
        highlight.clear();
    }
    for (const token of highlightMarkdownSource(text)) {
        const highlight = syntax.get(token.kind);
        if (!highlight || token.endExclusive <= token.start || token.endExclusive > node.length) {
            continue;
        }
        const range = new Range();
        range.setStart(node, token.start);
        range.setEnd(node, token.endExclusive);
        highlight.add(range);
    }
}

function paintHighlight(highlight: Highlight | undefined, node: Text, start: number, endExclusive: number): void {
    if (!highlight) {
        return;
    }
    highlight.clear();
    const from = Math.max(0, Math.min(start, node.length));
    const to = Math.max(from, Math.min(endExclusive, node.length));
    if (to <= from) {
        return;
    }
    const range = new Range();
    range.setStart(node, from);
    range.setEnd(node, to);
    highlight.add(range);
}

function revealOffset(source: HTMLElement, node: Text, offset: number): void {
    const rect = rangeRect(node, offset, Math.min(node.length, Math.max(0, Math.trunc(offset)) + 1));
    if (!rect) {
        return;
    }
    const host = source.getBoundingClientRect();
    const margin = 24;
    if (rect.top < host.top + margin) {
        source.scrollTop += rect.top - host.top - margin;
    } else if (rect.bottom > host.bottom - margin) {
        source.scrollTop += rect.bottom - host.bottom + margin;
    }
}

function rangeRect(node: Text, start: number, end: number): DOMRect | undefined {
    const clampedStart = Math.max(0, Math.min(Math.trunc(start), node.length));
    const clampedEnd = Math.max(clampedStart, Math.min(Math.trunc(end), node.length));
    const range = new Range();
    range.setStart(node, clampedStart);
    range.setEnd(node, clampedEnd);
    return range.getClientRects()[0];
}
