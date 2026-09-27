import { observableValue, type IObservable } from '@vscode/observables';
import { createDiffComputer } from '@vscode/diff';
import type { IDiffComputer, StringEdit as VscodeStringEdit } from '@vscode/diff';
import { OffsetRange } from '../core/offsetRange.js';
import { StringEdit, StringReplacement } from '../core/stringEdit.js';

const _owner = {};
const _ready = observableValue<boolean>(_owner, false);

/**
 * Becomes `true` once the `@vscode/diff` computer has loaded. Diff consumers
 * read this so they recompute with the better (character/word-level) algorithm
 * as soon as it is available.
 */
export const diffComputerReady: IObservable<boolean> = _ready;

let _computer: IDiffComputer | undefined;
let _readyPromise: Promise<void> | undefined;

/** Load the `@vscode/diff` computer (pure-TS, no WASM). Idempotent. */
export function ensureDiffComputer(): Promise<void> {
	if (!_readyPromise) {
		_readyPromise = createDiffComputer({ useWasm: false })
			.then(c => { _computer = c; _ready.set(true, undefined); })
			.catch(() => { /* keep the line-level fallback */ });
	}
	return _readyPromise;
}

// Start loading eagerly so the algorithm is ready as soon as possible.
void ensureDiffComputer();

/** Whether the `@vscode/diff` computer has finished loading. */
export function isDiffComputerReady(): boolean {
	return _computer !== undefined;
}

/**
 * Compute a {@link StringEdit} (original → modified) using `@vscode/diff`'s
 * character/word-level algorithm. The computer loads asynchronously (near
 * instantly, no WASM); callers must ensure it is ready first — observe
 * {@link diffComputerReady} or await {@link ensureDiffComputer}.
 */
export function computeStringEdit(original: string, modified: string): StringEdit {
	if (!_computer) {
		throw new Error('Diff computer not loaded yet — await ensureDiffComputer() / observe diffComputerReady first.');
	}
	const result = _computer.computeDiff(original, modified, { extendToSubwords: true });
	return _convert(result.edits.stripData());
}

/** Convert a `@vscode/diff` StringEdit into the editor's own StringEdit. */
function _convert(edit: VscodeStringEdit): StringEdit {
	return new StringEdit(edit.replacements.map(r =>
		StringReplacement.replace(new OffsetRange(r.range.start, r.range.endExclusive), r.newText)));
}
