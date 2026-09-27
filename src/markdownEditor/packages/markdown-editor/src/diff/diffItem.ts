import type { OffsetRange } from '../core/offsetRange.js';
import type { AstNode } from '../parser/ast.js';

/**
 * A word/character-level highlight inside a single block, in that block's
 * *local* coordinate space (`0` = block start). `inserted` ranges live on a
 * modified/added block, `deleted` ranges on an original/removed block.
 */
export interface AnnotatedRange {
	readonly range: OffsetRange;
	readonly kind: 'inserted' | 'deleted';
}

export interface UnchangedItem {
	readonly kind: 'unchanged';
	/** The modified-side node (identical in content to the original). */
	readonly node: AstNode;
	readonly modifiedStart: number;
}

export interface AddedItem {
	readonly kind: 'added';
	readonly node: AstNode;
	readonly modifiedStart: number;
	readonly insertedLocal: readonly AnnotatedRange[];
}

export interface RemovedItem {
	readonly kind: 'removed';
	readonly node: AstNode;
	readonly originalStart: number;
	readonly deletedLocal: readonly AnnotatedRange[];
}

export interface ReplacedItem {
	readonly kind: 'replaced';
	readonly original: AstNode;
	readonly originalStart: number;
	readonly modified: AstNode;
	readonly modifiedStart: number;
	readonly insertedLocal: readonly AnnotatedRange[];
	readonly deletedLocal: readonly AnnotatedRange[];
}

export interface NestedItem {
	readonly kind: 'nested';
	readonly original: AstNode;
	readonly originalStart: number;
	readonly modified: AstNode;
	readonly modifiedStart: number;
	readonly children: readonly DiffItem[];
}

/**
 * The recursive classification of a diff. Each item describes one aligned
 * position in the merged document:
 *
 * - `unchanged` — render the (modified) node once, neutral.
 * - `added`     — exists only in the modified document (green).
 * - `removed`   — exists only in the original document (red).
 * - `replaced`  — a *leaf* block changed in place → render original over
 *                 modified, with word-level {@link AnnotatedRange}s on each.
 * - `nested`    — a *container* changed → render it once and diff its
 *                 {@link NestedItem.children} recursively.
 *
 * Offsets ({@link UnchangedItem.modifiedStart} etc.) are absolute in their
 * respective documents, so a renderer/visualizer can slice the source text.
 */
export type DiffItem = UnchangedItem | AddedItem | RemovedItem | ReplacedItem | NestedItem;
