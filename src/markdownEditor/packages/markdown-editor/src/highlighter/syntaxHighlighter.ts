import type { IObservableWithChange, ITransaction, IDisposable } from '@vscode/observables';
import type { OffsetRange } from '../core/offsetRange.js';
import type { StringEdit } from '../core/stringEdit.js';
import type { LengthEdit } from '../core/lengthEdit.js';

export interface ISyntaxHighlighter {
    create(language: string, initialText: string): ISyntaxHighlighterDocument;
}

export interface ISyntaxHighlighterDocument extends IDisposable {
    /**
     * Apply a source edit. The {@link snapshot} updates synchronously within
     * `tx`, and the change it carries is the *minimal* {@link LengthEdit} that
     * actually re-coloured — not the whole document.
     */
    update(edit: StringEdit, tx: ITransaction): void;

    /**
     * The current snapshot. Its change reason is a {@link LengthEdit} mapping
     * the previous snapshot's offsets to this one's wherever tokens changed.
     */
    readonly snapshot: IObservableWithChange<ISyntaxHighlightedSnapshot, LengthEdit>;
}

/**
 * An immutable view of one document's tokens at a point in time. It may be a
 * thin view over the highlighter's mutable state: once the underlying document
 * advances, calling a stale snapshot is allowed to throw.
 *
 * Token stability: across snapshots `S1 -> S2` (with the change delivered as a
 * {@link LengthEdit}), `getTokens(r)` returns the same tokens for any range `r`
 * not touched by that edit. Only ranges the edit reports as changed may recolour.
 */
export interface ISyntaxHighlightedSnapshot {
    /**
     * Tokens covering a region that contains `queryRange`. Tokens are never
     * split: the returned {@link SnapshotTokens.range} is `queryRange` *grown*
     * to whole-token boundaries, so a token that straddles an end of
     * `queryRange` is returned in full. The result is dense over that grown
     * range — `sum(token.length) === range.length` — which is why the range is
     * returned alongside the tokens.
     */
    getTokens(queryRange: OffsetRange): SnapshotTokens;
}

/**
 * A run of {@link Token}s together with the exact {@link OffsetRange} they
 * cover.
 *
 * Because tokens are returned whole (never clipped), this is the natural unit
 * of structural comparison: for any region untouched by an edit, two snapshots
 * return an equal `SnapshotTokens` (same `range`, same token lengths/classes).
 */
export interface SnapshotTokens {
    readonly range: OffsetRange;
    readonly tokens: readonly Token[];
}

/**
 * A coloured run of `length` characters. Tokens are *dense* and *offset-free*:
 * a snapshot's tokens for a range cover it exactly, back to back, so
 * `sum(token.length) === range.length`. A token never stores where it is — its
 * position is implied by the lengths of the tokens before it, mirroring how the
 * rest of the editor keeps source offsets out of its data structures.
 */
export class Token {
    constructor(
        readonly length: number,
        /** CSS class for this run, or `undefined` for an unstyled run. */
        readonly className: string | undefined,
    ) { }
}
