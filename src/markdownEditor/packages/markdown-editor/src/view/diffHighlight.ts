import { OffsetRange } from '../core/offsetRange.js';
import type { ViewNode } from './content/viewNode.js';

interface TextLeaf { readonly text: Text; readonly start: number; readonly len: number; }

export interface MappedDomRange {
	readonly range: Range;
	readonly sourceRange: OffsetRange;
}

/** Text leaves of a view-node subtree with their source start offsets (root-local). */
function collectTextLeaves(root: ViewNode): TextLeaf[] {
	const out: TextLeaf[] = [];
	const walk = (n: ViewNode, base: number): void => {
		const kids = n.children;
		if (kids.length === 0) {
			if (n.dom.nodeType === 3 /* TEXT_NODE */) {
				const text = n.dom as Text;
				const mappedLength = Math.min(text.data.length, n.sourceLength);
				if (mappedLength > 0) {
					out.push({ text, start: base, len: mappedLength });
				}
			}
			return;
		}
		let pos = base;
		for (const c of kids) {
			// Skip zero-source nodes (e.g. the read-only diff decorations): their
			// rendered text is not part of this root's source space, so including
			// it would mis-map offsets onto the wrong (red) text.
			if (c.sourceLength === 0) { continue; }
			walk(c, pos);
			pos += c.sourceLength;
		}
	};
	walk(root, 0);
	return out;
}

function rangeWithinLeaf(leaf: TextLeaf, sourceRange: OffsetRange): Range {
	const range = document.createRange();
	range.setStart(leaf.text, sourceRange.start - leaf.start);
	range.setEnd(leaf.text, sourceRange.endExclusive - leaf.start);
	return range;
}

/**
 * Build DOM ranges for the visible portions of `spans`. Each result stays
 * within one text leaf, so a source span crossing hidden markdown syntax yields
 * the visible sub-ranges on either side instead of being dropped wholesale.
 */
export function mappedRangesForOffsets(
	root: ViewNode,
	spans: readonly OffsetRange[],
	limit = Number.POSITIVE_INFINITY,
): MappedDomRange[] {
	if (limit <= 0) { return []; }
	const leaves = collectTextLeaves(root);
	const sortedSpans = spans
		.slice()
		.sort((a, b) => a.start - b.start || a.endExclusive - b.endExclusive);
	const out: MappedDomRange[] = [];
	let leafIndex = 0;
	for (const span of sortedSpans) {
		if (span.isEmpty) {
			const leaf = leafAtOffset(leaves, span.start);
			if (leaf) {
				out.push({ range: rangeWithinLeaf(leaf, span), sourceRange: span });
				if (out.length >= limit) { return out; }
			}
			continue;
		}
		while (
			leafIndex < leaves.length
			&& leaves[leafIndex].start + leaves[leafIndex].len <= span.start
		) {
			leafIndex++;
		}
		for (let index = leafIndex; index < leaves.length; index++) {
			const leaf = leaves[index];
			if (leaf.start >= span.endExclusive) { break; }
			const sourceRange = span.intersect(
				OffsetRange.ofStartAndLength(leaf.start, leaf.len),
			);
			if (!sourceRange || sourceRange.isEmpty) { continue; }
			out.push({ range: rangeWithinLeaf(leaf, sourceRange), sourceRange });
			if (out.length >= limit) { return out; }
		}
	}
	return out;
}

export function rangesForOffsets(root: ViewNode, spans: readonly OffsetRange[]): Range[] {
	return mappedRangesForOffsets(root, spans).map(entry => entry.range);
}

function leafAtOffset(leaves: readonly TextLeaf[], offset: number): TextLeaf | undefined {
	return leaves.find(leaf => leaf.start <= offset && offset <= leaf.start + leaf.len);
}
