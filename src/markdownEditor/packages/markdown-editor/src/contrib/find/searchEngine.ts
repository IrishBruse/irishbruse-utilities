import { OffsetRange } from '../../core/offsetRange.js';
import { isRegularWordCharacter } from '../../core/wordUtils.js';

export const FIND_MATCH_LIMIT = 19_999;

export interface FindQuery {
	readonly searchString: string;
	readonly isRegex: boolean;
	readonly matchCase: boolean;
	readonly wholeWord: boolean;
	readonly wordSeparators: string;
}

export type FindQueryResult =
	| { readonly kind: 'valid'; readonly pattern: FindPattern }
	| { readonly kind: 'invalid'; readonly error: Error };

export interface FindMatchesResult {
	readonly matches: readonly OffsetRange[];
	readonly isCapped: boolean;
}

export class FindPattern {
	private constructor(
		private readonly _source: string,
		private readonly _flags: string,
		private readonly _wholeWord: boolean,
		private readonly _wordSeparators: string,
		readonly isEmpty: boolean,
	) {}

	static create(query: FindQuery): FindQueryResult {
		if (query.searchString.length === 0) {
			return {
				kind: 'valid',
				pattern: new FindPattern('', 'gmu', query.wholeWord, query.wordSeparators, true),
			};
		}

		const source = query.isRegex ? query.searchString : literalFindRegex(query.searchString);
		const flags = `gmu${query.matchCase ? '' : 'i'}`;
		try {
			void new RegExp(source, flags);
		} catch (error) {
			return {
				kind: 'invalid',
				error: error instanceof Error ? error : new Error(String(error)),
			};
		}
		return {
			kind: 'valid',
			pattern: new FindPattern(source, flags, query.wholeWord, query.wordSeparators, false),
		};
	}

	findMatches(
		text: string,
		scope?: OffsetRange,
		limit = FIND_MATCH_LIMIT,
	): FindMatchesResult {
		if (this.isEmpty || limit <= 0) {
			return { matches: [], isCapped: false };
		}

		const matches: OffsetRange[] = [];
		let isCapped = false;
		this._forEachMatch(text, scope, range => {
			if (matches.length === limit) {
				isCapped = true;
				return false;
			}
			matches.push(range);
			return true;
		});
		return { matches, isCapped };
	}

	findNextMatch(
		text: string,
		after: number,
		scope?: OffsetRange,
		loop = true,
		skip?: OffsetRange,
	): OffsetRange | undefined {
		if (this.isEmpty) { return undefined; }

		const start = clamp(after, 0, text.length);
		let first: OffsetRange | undefined;
		let result: OffsetRange | undefined;
		let sawSkippedMatch = false;
		this._forEachMatch(text, scope, range => {
			if (skip?.equals(range)) {
				sawSkippedMatch = true;
				return true;
			}
			first ??= range;
			if (range.start >= start) {
				result = range;
				return false;
			}
			return true;
		});
		return result ?? (loop ? first : undefined) ?? (sawSkippedMatch ? skip : undefined);
	}

	findPreviousMatch(
		text: string,
		before: number,
		scope?: OffsetRange,
		loop = true,
		skip?: OffsetRange,
	): OffsetRange | undefined {
		if (this.isEmpty) { return undefined; }

		const end = clamp(before, 0, text.length);
		let previous: OffsetRange | undefined;
		let last: OffsetRange | undefined;
		let sawSkippedMatch = false;
		this._forEachMatch(text, scope, range => {
			if (skip?.equals(range)) {
				sawSkippedMatch = true;
				return true;
			}
			last = range;
			if (range.endExclusive <= end) {
				previous = range;
			}
			return true;
		});
		return previous ?? (loop ? last : undefined) ?? (sawSkippedMatch ? skip : undefined);
	}

	private _forEachMatch(
		text: string,
		scope: OffsetRange | undefined,
		visitor: (range: OffsetRange) => boolean,
	): void {
		const normalizedScope = normalizeScope(scope, text.length);
		if (normalizedScope?.isEmpty) { return; }

		const regex = new RegExp(this._source, this._flags);
		while (true) {
			const match = regex.exec(text);
			if (!match) { return; }

			const range = OffsetRange.ofStartAndLength(match.index, match[0].length);
			if (
				(!normalizedScope || normalizedScope.containsRange(range))
				&& (!this._wholeWord || isWholeWordMatch(text, range, this._wordSeparators))
				&& !visitor(range)
			) {
				return;
			}

			if (match[0].length === 0) {
				regex.lastIndex = advanceStringIndex(text, regex.lastIndex);
			}
		}
	}
}

export function escapeFindRegex(value: string): string {
	return value.replace(/[\\{}()[\]^$+*?.|]/g, '\\$&');
}

function literalFindRegex(value: string): string {
	return value
		.split(/\r\n|\r|\n/)
		.map(escapeFindRegex)
		.join('(?:\\r\\n|[\\r\\n])');
}

function normalizeScope(scope: OffsetRange | undefined, textLength: number): OffsetRange | undefined {
	if (!scope) { return undefined; }
	const start = clamp(scope.start, 0, textLength);
	const endExclusive = clamp(scope.endExclusive, 0, textLength);
	return start <= endExclusive
		? new OffsetRange(start, endExclusive)
		: OffsetRange.emptyAt(start);
}

function isWholeWordMatch(text: string, range: OffsetRange, wordSeparators: string): boolean {
	const before = text[range.start - 1];
	const first = text[range.start];
	const last = text[range.endExclusive - 1];
	const after = text[range.endExclusive];

	const hasLeftBoundary = range.start === 0
		|| !isRegularWordCharacter(before, wordSeparators)
		|| (range.length > 0 && !isRegularWordCharacter(first, wordSeparators));
	const hasRightBoundary = range.endExclusive === text.length
		|| !isRegularWordCharacter(after, wordSeparators)
		|| (range.length > 0 && !isRegularWordCharacter(last, wordSeparators));
	return hasLeftBoundary && hasRightBoundary;
}

function advanceStringIndex(text: string, index: number): number {
	if (index >= text.length) { return text.length + 1; }
	const first = text.charCodeAt(index);
	if (first < 0xD800 || first > 0xDBFF || index + 1 >= text.length) {
		return index + 1;
	}
	const second = text.charCodeAt(index + 1);
	return second >= 0xDC00 && second <= 0xDFFF ? index + 2 : index + 1;
}

function clamp(value: number, min: number, max: number): number {
	return Math.min(Math.max(value, min), max);
}
