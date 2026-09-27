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

/** The cursor's position in either source text or a source-less visual line. */
export type CursorPosition =
	| { readonly kind: 'source'; readonly offset: SourceOffset }
	| { readonly kind: 'virtual'; readonly line: VirtualCursorLine };

export namespace CursorPosition {
	export function source(offset: SourceOffset): CursorPosition {
		return { kind: 'source', offset };
	}

	export function virtual(line: VirtualCursorLine): CursorPosition {
		return { kind: 'virtual', line };
	}
}
