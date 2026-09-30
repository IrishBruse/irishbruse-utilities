import { OffsetRange } from '../core/offsetRange.js';
import { GlueAstNode, type BlockAstNode, type DocumentAstNode } from '../parser/ast.js';

const EMPTY_LINE_GAP_KIND = new Set(['blockGap', 'blockQuoteSourceGap']);

/**
 * Trailing blank lines hosted on `block` (the empty-line `↵` icons).
 * The paragraph-ending newline between two paragraphs is a `blockBreak`
 * and is not included.
 */
export function trailingEmptyLineGap(block: BlockAstNode, blockStart: number): OffsetRange | undefined {
	const last = block.children[block.children.length - 1];
	if (!(last instanceof GlueAstNode)) { return undefined; }
	if (!last.glueKind || !EMPTY_LINE_GAP_KIND.has(last.glueKind)) { return undefined; }
	if (!/^[\n\r]+$/.test(last.content)) { return undefined; }
	const start = blockStart + block.length - last.length;
	return new OffsetRange(start, start + last.length);
}

/** Gap whose icons cover `offset` (`gap.start` itself is the end of the block text). */
export function emptyLineGapCovering(doc: DocumentAstNode, offset: number): OffsetRange | undefined {
	const blocks = new Set(doc.blocks);
	let pos = 0;
	for (const child of doc.children) {
		if (blocks.has(child as BlockAstNode)) {
			const gap = trailingEmptyLineGap(child as BlockAstNode, pos);
			if (gap && offset > gap.start && offset <= gap.endExclusive) {
				return gap;
			}
		}
		pos += child.length;
	}
	return undefined;
}

/**
 * Click on a heading's trailing `↵` icons lands at the end of the heading
 * text. A downstream hit on the next block's start is left alone.
 */
export function headingTextEndForClick(
	doc: DocumentAstNode,
	offset: number,
	upstream: boolean,
): number | undefined {
	const blocks = new Set(doc.blocks);
	let pos = 0;
	for (const child of doc.children) {
		if (blocks.has(child as BlockAstNode) && (child as BlockAstNode).kind === 'heading') {
			const gap = trailingEmptyLineGap(child as BlockAstNode, pos);
			if (gap && offset > gap.start && offset < gap.endExclusive) {
				return gap.start;
			}
			if (gap && upstream && offset === gap.endExclusive) {
				return gap.start;
			}
		}
		pos += child.length;
	}
	return undefined;
}

/** Selection endpoint: stay on the text side of an empty-line gap, or past it. */
export function clampOffEmptyLineGap(doc: DocumentAstNode, anchor: number, offset: number): number {
	const gap = emptyLineGapCovering(doc, offset);
	if (!gap) { return offset; }
	if (anchor <= gap.start) { return gap.start; }
	if (anchor >= gap.endExclusive) { return gap.endExclusive; }
	return offset;
}
