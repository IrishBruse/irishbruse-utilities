import { OffsetRange } from '../core/offsetRange.js';
import type { StringEdit } from '../core/stringEdit.js';
import type { AstNode, DocumentAstNode } from '../parser/ast.js';
import { EditMapper } from '../parser/reconcile.js';
import { changedRanges, type ChangedRange } from './diffEdit.js';
import type { AnnotatedRange, DiffItem } from './diffItem.js';

/**
 * Node kinds whose changes are diffed *structurally* (render the container
 * once, recurse into its children). Everything else is a leaf: a change there
 * produces a `replaced` item with word-level highlights.
 *
 * A `listItem` is deliberately a *leaf*, not a container: its marker (`- `,
 * `1. `) is structural syntax that the aligner skips, so recursing would orphan
 * a marker character caught in a change boundary (it would belong to no child
 * decoration). As a leaf the whole original item — marker included — is shown
 * over the modified one, with word-level highlights inside. A `tableCell` is a
 * leaf for the same reason (its `|`/padding glue would otherwise be orphaned),
 * and it only ever holds inline content anyway.
 */
const CONTAINER_KINDS: ReadonlySet<string> = new Set([
	'document', 'list', 'blockQuote', 'table', 'tableRow',
]);

/** Child kinds that are structural noise for alignment (still counted for offsets). */
const SKIP_KINDS: ReadonlySet<string> = new Set(['glue', 'marker']);

interface PositionedNode { readonly node: AstNode; readonly start: number; }

/**
 * Classify the difference between two parsed documents, using the textual
 * `edit` (original → modified) as the alignment oracle. Returns a recursive
 * {@link DiffItem} list over the document's blocks.
 *
 * The alignment is purely offset-based (no tree-diff): each modified node is
 * mapped back through {@link EditMapper}; a clean mapping that lines up with the
 * next original node is `unchanged`, a same-kind node whose origin lands inside
 * the next original node is a change (recursed if a container, else a leaf
 * `replaced`), an unmappable node is `added`, and any original node not consumed
 * is `removed`.
 */
export function classifyDiff(original: DocumentAstNode, modified: DocumentAstNode, edit: StringEdit): DiffItem[] {
	const mapper = new EditMapper(edit);
	const changes = changedRanges(edit);
	return classifyChildren(original, 0, modified, 0, mapper, changes);
}

function classifyChildren(
	origParent: AstNode,
	origParentStart: number,
	modParent: AstNode,
	modParentStart: number,
	mapper: EditMapper,
	changes: readonly ChangedRange[],
): DiffItem[] {
	const O = structuralChildren(origParent, origParentStart);
	const M = structuralChildren(modParent, modParentStart);
	const items: DiffItem[] = [];
	let oi = 0;

	for (const m of M) {
		const mRange = OffsetRange.ofStartAndLength(m.start, m.node.length);
		const os = mapper.getOriginalOffset(m.start);

		// Original children lying entirely before m's origin were deleted.
		while (oi < O.length && os !== undefined && O[oi].start + O[oi].node.length <= os) {
			items.push(removedItem(O[oi], changes));
			oi++;
		}

		const cand = oi < O.length ? O[oi] : undefined;
		const candRange = cand ? OffsetRange.ofStartAndLength(cand.start, cand.node.length) : undefined;
		const clean = mapper.getOriginalRange(mRange);

		if (clean && candRange && clean.equals(candRange)) {
			items.push({ kind: 'unchanged', node: m.node, modifiedStart: m.start });
			oi++;
		} else if (cand && candRange && cand.node.kind === m.node.kind && os !== undefined && candRange.contains(os)) {
			oi++;
			if (CONTAINER_KINDS.has(m.node.kind)) {
				items.push({
					kind: 'nested',
					original: cand.node, originalStart: cand.start,
					modified: m.node, modifiedStart: m.start,
					children: classifyChildren(cand.node, cand.start, m.node, m.start, mapper, changes),
				});
			} else {
				items.push({
					kind: 'replaced',
					original: cand.node, originalStart: cand.start,
					modified: m.node, modifiedStart: m.start,
					insertedLocal: localRanges(mRange, m.start, changes, 'modified', 'inserted'),
					deletedLocal: localRanges(candRange, cand.start, changes, 'original', 'deleted'),
				});
			}
		} else {
			items.push(addedItem(m, changes));
		}
	}

	while (oi < O.length) {
		items.push(removedItem(O[oi], changes));
		oi++;
	}
	return items;
}

/** Children that participate in alignment, with absolute start offsets. */
function structuralChildren(node: AstNode, nodeStart: number): PositionedNode[] {
	const out: PositionedNode[] = [];
	let pos = nodeStart;
	for (const c of node.children) {
		if (!SKIP_KINDS.has(c.kind)) { out.push({ node: c, start: pos }); }
		pos += c.length;
	}
	return out;
}

function addedItem(m: PositionedNode, changes: readonly ChangedRange[]): DiffItem {
	const range = OffsetRange.ofStartAndLength(m.start, m.node.length);
	let inserted = localRanges(range, m.start, changes, 'modified', 'inserted');
	if (inserted.length === 0) { inserted = [{ range: OffsetRange.ofLength(m.node.length), kind: 'inserted' }]; }
	return { kind: 'added', node: m.node, modifiedStart: m.start, insertedLocal: inserted };
}

function removedItem(o: PositionedNode, changes: readonly ChangedRange[]): DiffItem {
	const range = OffsetRange.ofStartAndLength(o.start, o.node.length);
	let deleted = localRanges(range, o.start, changes, 'original', 'deleted');
	if (deleted.length === 0) { deleted = [{ range: OffsetRange.ofLength(o.node.length), kind: 'deleted' }]; }
	return { kind: 'removed', node: o.node, originalStart: o.start, deletedLocal: deleted };
}

/** Intersect the changed ranges with a node and project into the node's local space. */
function localRanges(
	nodeRange: OffsetRange,
	nodeStart: number,
	changes: readonly ChangedRange[],
	side: 'original' | 'modified',
	kind: 'inserted' | 'deleted',
): AnnotatedRange[] {
	const out: AnnotatedRange[] = [];
	for (const c of changes) {
		const cr = side === 'original' ? c.original : c.modified;
		const inter = cr.intersect(nodeRange);
		if (inter && !inter.isEmpty) {
			out.push({ range: inter.delta(-nodeStart), kind });
		}
	}
	return out;
}
