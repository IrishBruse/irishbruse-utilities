import { OffsetRange } from './offsetRange.js';

export class StringReplacement {
	public static insert(offset: number, text: string): StringReplacement {
		return new StringReplacement(OffsetRange.emptyAt(offset), text);
	}

	public static replace(range: OffsetRange, text: string): StringReplacement {
		return new StringReplacement(range, text);
	}

	public static delete(range: OffsetRange): StringReplacement {
		return new StringReplacement(range, '');
	}

	constructor(
		public readonly replaceRange: OffsetRange,
		public readonly newText: string,
	) {}

	get isEmpty(): boolean {
		return this.replaceRange.isEmpty && this.newText.length === 0;
	}

	public equals(other: StringReplacement): boolean {
		return this.replaceRange.equals(other.replaceRange) && this.newText === other.newText;
	}

	/**
	 * Narrows this replacement to the span that actually changes, by trimming
	 * the prefix and suffix it shares with the text it replaces in `source`.
	 */
	public removeCommonSuffixPrefix(source: string): StringReplacement {
		const oldText = this.replaceRange.substring(source);

		const prefixLength = commonPrefixLength(oldText, this.newText);
		const suffixLength = Math.min(
			oldText.length - prefixLength,
			this.newText.length - prefixLength,
			commonSuffixLength(oldText, this.newText),
		);

		return new StringReplacement(
			new OffsetRange(
				this.replaceRange.start + prefixLength,
				this.replaceRange.endExclusive - suffixLength,
			),
			this.newText.substring(prefixLength, this.newText.length - suffixLength),
		);
	}

	public toString(): string {
		return `${this.replaceRange} -> ${JSON.stringify(this.newText)}`;
	}
}

/** The length of the common prefix of `a` and `b`. */
function commonPrefixLength(a: string, b: string): number {
	const maxLength = Math.min(a.length, b.length);
	let length = 0;
	while (length < maxLength && a.charCodeAt(length) === b.charCodeAt(length)) {
		length++;
	}
	return length;
}

/** The length of the common suffix of `a` and `b`. */
function commonSuffixLength(a: string, b: string): number {
	const maxLength = Math.min(a.length, b.length);
	let length = 0;
	while (
		length < maxLength
		&& a.charCodeAt(a.length - length - 1) === b.charCodeAt(b.length - length - 1)
	) {
		length++;
	}
	return length;
}

export class StringEdit {
	public static readonly empty = new StringEdit([]);

	public static single(replacement: StringReplacement): StringEdit {
		return new StringEdit([replacement]);
	}

	public static replace(range: OffsetRange, text: string): StringEdit {
		return new StringEdit([StringReplacement.replace(range, text)]);
	}

	public static insert(offset: number, text: string): StringEdit {
		return new StringEdit([StringReplacement.insert(offset, text)]);
	}

	public static delete(range: OffsetRange): StringEdit {
		return new StringEdit([StringReplacement.delete(range)]);
	}

	public readonly replacements: readonly StringReplacement[];

	constructor(replacements: readonly StringReplacement[]) {
		let lastEndEx = -1;
		for (const replacement of replacements) {
			if (replacement.replaceRange.start < lastEndEx) {
				throw new Error(
					`Edits must be disjoint and sorted. Found ${replacement} after ${lastEndEx}`,
				);
			}
			lastEndEx = replacement.replaceRange.endExclusive;
		}
		this.replacements = replacements;
	}

	get isEmpty(): boolean {
		return this.replacements.length === 0;
	}

	public apply(base: string): string {
		const parts: string[] = [];
		let pos = 0;
		for (const r of this.replacements) {
			parts.push(base.substring(pos, r.replaceRange.start));
			parts.push(r.newText);
			pos = r.replaceRange.endExclusive;
		}
		parts.push(base.substring(pos));
		return parts.join('');
	}

	public inverse(original: string): StringEdit {
		const edits: StringReplacement[] = [];
		let offset = 0;
		for (const r of this.replacements) {
			const oldText = original.substring(r.replaceRange.start, r.replaceRange.endExclusive);
			edits.push(
				StringReplacement.replace(
					OffsetRange.ofStartAndLength(r.replaceRange.start + offset, r.newText.length),
					oldText,
				),
			);
			offset += r.newText.length - r.replaceRange.length;
		}
		return new StringEdit(edits);
	}

	public equals(other: StringEdit): boolean {
		if (this.replacements.length !== other.replacements.length) {
			return false;
		}
		for (let i = 0; i < this.replacements.length; i++) {
			if (!this.replacements[i].equals(other.replacements[i])) {
				return false;
			}
		}
		return true;
	}

	public mapOffset(offset: number): number {
		let delta = 0;
		for (const r of this.replacements) {
			if (r.replaceRange.start > offset) {
				break;
			}
			if (r.replaceRange.endExclusive <= offset) {
				delta += r.newText.length - r.replaceRange.length;
			} else {
				// offset is inside a replaced range — map to end of replacement
				return r.replaceRange.start + delta + r.newText.length;
			}
		}
		return offset + delta;
	}

	public toString(): string {
		return `[${this.replacements.map(r => r.toString()).join(', ')}]`;
	}
}

/**
 * Computes the smallest single replacement that transforms `original` into
 * `modified`.
 *
 * Distinct from {@link computeStringEdit}, which produces a word-level
 * multi-hunk diff but requires the asynchronously loaded `@vscode/diff`
 * computer and throws before it is ready. This one is synchronous and
 * dependency-free, so it is safe on the edit-application and history paths.
 */
export function computeMinimalEdit(original: string, modified: string): StringEdit {
	if (original === modified) {
		return StringEdit.empty;
	}

	return StringEdit.single(
		StringReplacement
			.replace(new OffsetRange(0, original.length), modified)
			.removeCommonSuffixPrefix(original),
	);
}
