import {
    EditorModel,
    StringValue,
    blocksIntersecting,
    findNodeOffsetById,
    type DocumentAstNode,
} from "@vscode/markdown-editor";

export interface SourceSelection {
    readonly anchor: number;
    readonly active: number;
}

export interface MarkdownEdit {
    /** Range in the text before the edit. */
    readonly start: number;
    readonly endExclusive: number;
    readonly deleted: string;
    readonly inserted: string;
}

export interface TextSpan {
    readonly start: number;
    readonly endExclusive: number;
}

export interface ActiveBlockSource {
    readonly kind: string;
    readonly range: TextSpan;
    readonly source: string;
}

export interface SelectionPresentation {
    readonly label: string;
    readonly blocks: readonly ActiveBlockSource[];
    /** Union of {@link blocks} for highlighting the full-document source. */
    readonly range: TextSpan | undefined;
    /** Caret offset. Absent when a range is selected. */
    readonly caret: number | undefined;
}

export interface EditPresentation {
    readonly label: string;
    readonly deleted: string;
    readonly inserted: string;
    /** Inserted text in the document after the edit. Absent for a pure deletion. */
    readonly insertedRange: TextSpan | undefined;
}

const EXCERPT_LIMIT = 240;

let parsedSource: string | undefined;
let parsedDocument: DocumentAstNode | undefined;

function documentForSource(text: string): DocumentAstNode {
    if (text !== parsedSource) {
        const model = new EditorModel();
        model.sourceText.set(new StringValue(text), undefined);
        parsedDocument = model.document.get();
        parsedSource = text;
    }
    return parsedDocument!;
}

/** Each active block's raw source, in document order (same rule as the editor's active blocks). */
export function activeBlockSources(text: string, selection: SourceSelection | undefined): readonly ActiveBlockSource[] {
    if (!selection) {
        return [];
    }
    const doc = documentForSource(text);
    const anchor = clampOffset(selection.anchor, text.length);
    const active = clampOffset(selection.active, text.length);
    const start = Math.min(anchor, active);
    const endExclusive = Math.max(anchor, active);
    const intersecting = blocksIntersecting(doc, start, endExclusive);
    const blocks: ActiveBlockSource[] = [];
    for (const block of intersecting) {
        const offset = findNodeOffsetById(doc, block);
        if (offset === undefined) {
            continue;
        }
        const range = { start: offset, endExclusive: offset + block.length };
        blocks.push({
            kind: block.kind,
            range,
            source: text.slice(range.start, range.endExclusive),
        });
    }
    blocks.sort((left, right) => left.range.start - right.range.start);
    return blocks;
}

/** Source span of every block that intersects the current selection (same rule as the editor's active blocks). */
export function activeBlockSourceRange(text: string, selection: SourceSelection | undefined): TextSpan | undefined {
    const blocks = activeBlockSources(text, selection);
    if (blocks.length === 0) {
        return undefined;
    }
    let rangeStart = text.length;
    let rangeEnd = 0;
    for (const block of blocks) {
        rangeStart = Math.min(rangeStart, block.range.start);
        rangeEnd = Math.max(rangeEnd, block.range.endExclusive);
    }
    if (rangeEnd <= rangeStart) {
        return undefined;
    }
    return { start: rangeStart, endExclusive: rangeEnd };
}

/** Selection persisted by the editor view state, if both offsets are present. */
export function selectionFromViewState(state: unknown): SourceSelection | undefined {
    if (!state || typeof state !== "object") {
        return undefined;
    }
    const selection = (state as { selection?: unknown }).selection;
    if (!selection || typeof selection !== "object") {
        return undefined;
    }
    const { anchor, active } = selection as { anchor?: unknown; active?: unknown };
    if (typeof anchor !== "number" || typeof active !== "number" || !Number.isFinite(anchor) || !Number.isFinite(active)) {
        return undefined;
    }
    return { anchor, active };
}

/**
 * Join a new edit onto the previous one when it keeps typing at the end of that edit.
 * A caret move or an edit somewhere else starts a new edit.
 */
export function coalesceMarkdownEdits(previous: MarkdownEdit | undefined, next: MarkdownEdit): MarkdownEdit {
    if (!previous) {
        return next;
    }
    const previousEnd = previous.start + previous.inserted.length;
    const continues =
        next.deleted.length === 0 && next.start === previousEnd && next.endExclusive === next.start;
    if (!continues) {
        return next;
    }
    return {
        start: previous.start,
        endExclusive: previous.endExclusive,
        deleted: previous.deleted,
        inserted: previous.inserted + next.inserted,
    };
}

/** Single edit that turns `before` into `after`, using the same offsets as the editor. */
export function diffMarkdown(before: string, after: string): MarkdownEdit {
    let start = 0;
    while (start < before.length && start < after.length && before.charCodeAt(start) === after.charCodeAt(start)) {
        start++;
    }

    let beforeEnd = before.length;
    let afterEnd = after.length;
    while (beforeEnd > start && afterEnd > start && before.charCodeAt(beforeEnd - 1) === after.charCodeAt(afterEnd - 1)) {
        beforeEnd--;
        afterEnd--;
    }

    return {
        start,
        endExclusive: beforeEnd,
        deleted: before.slice(start, beforeEnd),
        inserted: after.slice(start, afterEnd),
    };
}

export function presentSelection(text: string, selection: SourceSelection | undefined): SelectionPresentation {
    if (!selection) {
        return { label: "No active block", blocks: [], range: undefined, caret: undefined };
    }

    const anchor = clampOffset(selection.anchor, text.length);
    const active = clampOffset(selection.active, text.length);
    const collapsed = anchor === active;
    const blocks = activeBlockSources(text, selection);
    const blockRange = activeBlockSourceRange(text, selection);
    if (!blockRange || blocks.length === 0) {
        return {
            label: collapsed ? `Caret at offset ${active} · no block` : `Selection · no active block`,
            blocks: [],
            range: undefined,
            caret: collapsed ? active : undefined,
        };
    }

    const length = blockRange.endExclusive - blockRange.start;
    const heading = blocks.length === 1 ? "Active block" : "Active blocks";
    const count = blocks.length === 1 ? "" : `${blocks.length} blocks · `;
    return {
        label: `${heading} · ${count}offsets ${blockRange.start} to ${blockRange.endExclusive} (${characters(length)})`,
        blocks,
        range: blockRange,
        caret: collapsed ? active : undefined,
    };
}

export function presentEdit(edit: MarkdownEdit): EditPresentation {
    const deleted = clipExcerpt(edit.deleted);
    const inserted = clipExcerpt(edit.inserted);
    const truncated = deleted.truncated || inserted.truncated ? ". Text truncated" : "";
    const insertedRange =
        edit.inserted.length > 0 ? { start: edit.start, endExclusive: edit.start + edit.inserted.length } : undefined;

    if (edit.deleted.length === 0) {
        return {
            label: `Inserted ${characters(edit.inserted.length)} at offset ${edit.start}${truncated}`,
            deleted: "",
            inserted: inserted.text,
            insertedRange,
        };
    }
    if (edit.inserted.length === 0) {
        return {
            label: `Deleted ${characters(edit.deleted.length)} at offsets ${edit.start} to ${edit.endExclusive}${truncated}`,
            deleted: deleted.text,
            inserted: "",
            insertedRange: undefined,
        };
    }
    return {
        label: `Replaced ${characters(edit.deleted.length)} at offsets ${edit.start} to ${edit.endExclusive} with ${characters(edit.inserted.length)}${truncated}`,
        deleted: deleted.text,
        inserted: inserted.text,
        insertedRange,
    };
}

function clipExcerpt(text: string): { text: string; truncated: boolean } {
    if (text.length <= EXCERPT_LIMIT) {
        return { text, truncated: false };
    }
    return { text: text.slice(0, EXCERPT_LIMIT), truncated: true };
}

function characters(count: number): string {
    return count === 1 ? "1 character" : `${count} characters`;
}

function clampOffset(offset: number, length: number): number {
    return Math.min(length, Math.max(0, Math.trunc(offset)));
}
