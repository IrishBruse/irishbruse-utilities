import type { SourceOffset } from './sourceOffset.js';

/**
 * A visual cursor line that has no representation in the source text.
 *
 * The two source offsets are the positions immediately before and after the
 * virtual line. The object itself is the stable identity of the line.
 */
export class VirtualCursorLine {
	constructor(
		readonly sourceOffsetBefore: SourceOffset,
		readonly sourceOffsetAfter: SourceOffset,
	) { }
}

/**
 * At a newline glyph, `upstream` draws the caret on the glyph's right edge.
 * `downstream` draws that same offset at the start of the next line.
 */
export type CursorAffinity = 'upstream' | 'downstream';

/** The cursor's position in either source text or a source-less visual line. */
export type CursorPosition =
	| { readonly kind: 'source'; readonly offset: SourceOffset; readonly affinity?: CursorAffinity }
	| { readonly kind: 'virtual'; readonly line: VirtualCursorLine };

export namespace CursorPosition {
	export function source(offset: SourceOffset, affinity?: CursorAffinity): CursorPosition {
		return affinity === undefined || affinity === 'downstream'
			? { kind: 'source', offset }
			: { kind: 'source', offset, affinity };
	}

	export function virtual(line: VirtualCursorLine): CursorPosition {
		return { kind: 'virtual', line };
	}
}
