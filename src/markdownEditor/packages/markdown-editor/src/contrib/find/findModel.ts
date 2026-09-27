import { Disposable, autorun, derived, observableValue, transaction } from '@vscode/observables';
import type { IReader } from '@vscode/observables';
import { OffsetRange } from '../../core/offsetRange.js';
import type { StringEdit } from '../../core/stringEdit.js';
import type { EditorModel, SourceEditEvent } from '../../model/editorModel.js';
import { FindPattern, type FindQueryResult } from './searchEngine.js';
import { SourceEditTracker } from './sourceEditTracker.js';

export type FindSearchResult =
	| {
		readonly kind: 'valid';
		readonly pattern: FindPattern;
		readonly matches: readonly OffsetRange[];
		readonly isCapped: boolean;
	}
	| { readonly kind: 'invalid'; readonly error: Error };

export type FindDirection = 'next' | 'previous';

interface FindInputSnapshot {
	readonly isRevealed: boolean;
	readonly searchString: string;
	readonly isRegex: boolean;
	readonly matchCase: boolean;
	readonly wholeWord: boolean;
	readonly scope: OffsetRange | undefined;
}

export class FindModel extends Disposable {
	readonly isRevealed = observableValue<boolean>(this, false);
	readonly searchString = observableValue<string>(this, '');
	readonly isRegex = observableValue<boolean>(this, false);
	readonly matchCase = observableValue<boolean>(this, false);
	readonly wholeWord = observableValue<boolean>(this, false);
	readonly searchScope = observableValue<OffsetRange | undefined>(this, undefined);
	readonly currentMatch = observableValue<OffsetRange | undefined>(this, undefined);
	readonly loop = observableValue<boolean>(this, true);

	readonly searchResult = derived(this, reader => {
		const source = this._editorModel.sourceText.read(reader).value;
		const patternResult: FindQueryResult = FindPattern.create({
			searchString: this.searchString.read(reader),
			isRegex: this.isRegex.read(reader),
			matchCase: this.matchCase.read(reader),
			wholeWord: this.wholeWord.read(reader),
			wordSeparators: this._editorModel.wordNavigationConfig.read(reader).wordSeparators,
		});
		if (patternResult.kind === 'invalid') {
			return { kind: 'invalid', error: patternResult.error } satisfies FindSearchResult;
		}
		const result = patternResult.pattern.findMatches(source, this.searchScope.read(reader));
		return {
			kind: 'valid',
			pattern: patternResult.pattern,
			matches: result.matches,
			isCapped: result.isCapped,
		} satisfies FindSearchResult;
	});

	readonly matchesCount = derived(this, reader => {
		const result = this.searchResult.read(reader);
		return result.kind === 'valid' ? result.matches.length : 0;
	});

	readonly isCapped = derived(this, reader => {
		const result = this.searchResult.read(reader);
		return result.kind === 'valid' && result.isCapped;
	});

	readonly currentMatchPosition = derived(this, reader => {
		const current = this.currentMatch.read(reader);
		if (!current) { return 0; }
		const result = this.searchResult.read(reader);
		if (result.kind === 'invalid') { return 0; }
		const index = result.matches.findIndex(match => match.equals(current));
		return index < 0 ? 0 : index + 1;
	});

	private _searchOrigin = 0;
	private readonly _sourceEditTracker: SourceEditTracker;
	private _pendingInitialDirection: FindDirection | undefined;

	constructor(private readonly _editorModel: EditorModel) {
		super();
		this._sourceEditTracker = new SourceEditTracker(this._editorModel);

		let previousInputs = this._inputSnapshot();

		this._register(this._editorModel.onWillApplySourceEdit(event => {
			this._mapStateThroughEdit(event);
			this._sourceEditTracker.record(event);
		}));

		this._register(autorun(reader => {
			const sourceText = this._editorModel.sourceText.read(reader);
			const source = sourceText.value;
			const inputs = this._readInputSnapshot(reader);
			const sourceChange = this._sourceEditTracker.consume(sourceText);
			const sourceChanged = sourceChange.sourceIdentityChanged;
			const expectedSourceChange = sourceChanged && sourceChange.isExpected;

			if (sourceChanged && !expectedSourceChange) {
				this._searchOrigin = clamp(this._searchOrigin, 0, source.length);
				previousInputs = { ...inputs, scope: undefined };
				transaction(tx => {
					this.searchScope.set(undefined, tx);
					this.currentMatch.set(undefined, tx);
				});
				return;
			}

			const becameVisible = inputs.isRevealed && !previousInputs.isRevealed;
			const queryChanged = !sameQuery(inputs, previousInputs);
			const scopeChangedExplicitly = !sameRange(inputs.scope, previousInputs.scope) && !sourceChanged;

			if (!inputs.isRevealed) {
				if (previousInputs.isRevealed) {
					this.currentMatch.set(undefined, undefined);
				}
			} else {
				const result = this.searchResult.read(reader);
				if (result.kind === 'invalid' || result.pattern.isEmpty || result.matches.length === 0) {
					this.currentMatch.set(undefined, undefined);
				} else if (becameVisible || queryChanged || scopeChangedExplicitly) {
					this._selectFromOrigin(result, this._pendingInitialDirection ?? 'next');
				} else if (sourceChanged) {
					const current = this.currentMatch.get();
					if (current && !isExactMatch(result, source, inputs.scope, current)) {
						this.currentMatch.set(undefined, undefined);
					}
				}
			}
			this._pendingInitialDirection = undefined;
			this._pendingInitialDirection = undefined;
			previousInputs = inputs;
		}));
	}

	reveal(options: {
		readonly origin: number;
		readonly searchString?: string;
		readonly direction?: FindDirection;
	}): void {
		this._searchOrigin = clamp(options.origin, 0, this._editorModel.sourceText.get().value.length);
		this._pendingInitialDirection = options.direction ?? 'next';
		transaction(tx => {
			if (options.searchString !== undefined) {
				this.searchString.set(options.searchString, tx);
			}
			this.isRevealed.set(true, tx);
		});
	}

	hide(): void {
		transaction(tx => {
			this.isRevealed.set(false, tx);
			this.searchScope.set(undefined, tx);
			this.currentMatch.set(undefined, tx);
		});
	}

	setSearchOrigin(offset: number): void {
		this._searchOrigin = clamp(offset, 0, this._editorModel.sourceText.get().value.length);
	}

	setSearchScope(scope: OffsetRange | undefined): void {
		this.searchScope.set(scope, undefined);
	}

	moveToNextMatch(): OffsetRange | undefined {
		return this._move('next');
	}

	moveToPreviousMatch(): OffsetRange | undefined {
		return this._move('previous');
	}

	private _move(direction: FindDirection): OffsetRange | undefined {
		const result = this.searchResult.get();
		if (result.kind === 'invalid' || result.pattern.isEmpty) {
			this.currentMatch.set(undefined, undefined);
			return undefined;
		}

		const text = this._editorModel.sourceText.get().value;
		const current = this.currentMatch.get();
		const scope = this.searchScope.get();
		const match = direction === 'next'
			? result.pattern.findNextMatch(
				text,
				current?.endExclusive ?? this._searchOrigin,
				scope,
				this.loop.get(),
				current,
			)
			: result.pattern.findPreviousMatch(
				text,
				current?.start ?? this._searchOrigin,
				scope,
				this.loop.get(),
				current,
			);
		this.currentMatch.set(match, undefined);
		return match;
	}

	private _selectFromOrigin(result: Extract<FindSearchResult, { kind: 'valid' }>, direction: FindDirection): void {
		const text = this._editorModel.sourceText.get().value;
		const scope = this.searchScope.get();
		const match = direction === 'next'
			? result.pattern.findNextMatch(text, this._searchOrigin, scope, this.loop.get())
			: result.pattern.findPreviousMatch(text, this._searchOrigin, scope, this.loop.get());
		this.currentMatch.set(match, undefined);
	}

	private _mapStateThroughEdit(event: SourceEditEvent): void {
		this._searchOrigin = mapTrackedOffset(event.edit, this._searchOrigin, 'after');

		const scope = this.searchScope.get();
		if (scope) {
			this.searchScope.set(mapTrackedRange(event.edit, scope), event.transaction);
		}

		const current = this.currentMatch.get();
		if (current) {
			this.currentMatch.set(
				editTouchesRange(event.edit, current) ? undefined : mapTrackedRange(event.edit, current),
				event.transaction,
			);
		}
	}

	private _inputSnapshot(): FindInputSnapshot {
		return {
			isRevealed: this.isRevealed.get(),
			searchString: this.searchString.get(),
			isRegex: this.isRegex.get(),
			matchCase: this.matchCase.get(),
			wholeWord: this.wholeWord.get(),
			scope: this.searchScope.get(),
		};
	}

	private _readInputSnapshot(reader: IReader): FindInputSnapshot {
		return {
			isRevealed: this.isRevealed.read(reader),
			searchString: this.searchString.read(reader),
			isRegex: this.isRegex.read(reader),
			matchCase: this.matchCase.read(reader),
			wholeWord: this.wholeWord.read(reader),
			scope: this.searchScope.read(reader),
		};
	}
}

function isExactMatch(
	result: Extract<FindSearchResult, { kind: 'valid' }>,
	text: string,
	scope: OffsetRange | undefined,
	current: OffsetRange,
): boolean {
	return result.pattern.findNextMatch(text, current.start, scope, false)?.equals(current) ?? false;
}

function sameQuery(a: FindInputSnapshot, b: FindInputSnapshot): boolean {
	return a.searchString === b.searchString
		&& a.isRegex === b.isRegex
		&& a.matchCase === b.matchCase
		&& a.wholeWord === b.wholeWord;
}

function sameRange(a: OffsetRange | undefined, b: OffsetRange | undefined): boolean {
	return a === b || (!!a && !!b && a.equals(b));
}

function mapTrackedRange(edit: StringEdit, range: OffsetRange): OffsetRange {
	const start = mapTrackedOffset(edit, range.start, 'after');
	const endExclusive = mapTrackedOffset(edit, range.endExclusive, 'before');
	return new OffsetRange(Math.min(start, endExclusive), Math.max(start, endExclusive));
}

function mapTrackedOffset(edit: StringEdit, offset: number, affinity: 'before' | 'after'): number {
	let delta = 0;
	for (const replacement of edit.replacements) {
		const range = replacement.replaceRange;
		if (offset < range.start) { break; }
		if (offset > range.endExclusive) {
			delta += replacement.newText.length - range.length;
			continue;
		}
		if (range.isEmpty) {
			return range.start + delta + (affinity === 'after' ? replacement.newText.length : 0);
		}
		if (offset === range.start && affinity === 'before') {
			return range.start + delta;
		}
		return range.start + delta + replacement.newText.length;
	}
	return offset + delta;
}

function editTouchesRange(edit: StringEdit, range: OffsetRange): boolean {
	return edit.replacements.some(replacement => {
		const editRange = replacement.replaceRange;
		if (editRange.isEmpty) {
			return range.start < editRange.start && editRange.start < range.endExclusive;
		}
		if (range.isEmpty) {
			return editRange.contains(range.start);
		}
		return editRange.intersects(range);
	});
}

function clamp(value: number, min: number, max: number): number {
	return Math.min(Math.max(value, min), max);
}
