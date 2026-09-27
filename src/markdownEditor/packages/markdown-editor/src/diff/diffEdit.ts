import { OffsetRange } from '../core/offsetRange.js';
import type { StringEdit } from '../core/stringEdit.js';

/**
 * A changed region, expressed in *both* coordinate spaces: {@link original}
 * is the range in the original document, {@link modified} the corresponding
 * range in the modified document. An insertion has an empty {@link original};
 * a deletion an empty {@link modified}.
 */
export interface ChangedRange {
	readonly original: OffsetRange;
	readonly modified: OffsetRange;
}

/**
 * Transform a {@link StringEdit} (original → modified) into the list of changed
 * ranges, each mapped between the two coordinate spaces. This is the bridge the
 * diff classifier and the word-level highlighter both consume.
 */
export function changedRanges(edit: StringEdit): ChangedRange[] {
	let delta = 0;
	const out: ChangedRange[] = [];
	for (const r of edit.replacements) {
		const modStart = r.replaceRange.start + delta;
		out.push({
			original: r.replaceRange,
			modified: OffsetRange.ofStartAndLength(modStart, r.newText.length),
		});
		delta += r.newText.length - r.replaceRange.length;
	}
	return out;
}
