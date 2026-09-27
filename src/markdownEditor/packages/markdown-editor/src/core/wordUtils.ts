export const DEFAULT_WORD_SEPARATORS = '`~!@#$%^&*()-=+[{]}\\|;:\'",.<>/?';

export interface WordNavigationConfig {
	readonly wordSeparators: string;
	readonly wordSegmenterLocales: readonly string[];
}

export const DEFAULT_WORD_NAVIGATION_CONFIG: WordNavigationConfig = {
	wordSeparators: DEFAULT_WORD_SEPARATORS,
	wordSegmenterLocales: [],
};

export function isRegularWordCharacter(character: string | undefined, wordSeparators: string): boolean {
	return character !== undefined
		&& !/\s/u.test(character)
		&& !wordSeparators.includes(character);
}

const enum WordCharacterClass {
	Regular,
	Whitespace,
	Separator,
}

const enum WordType {
	Regular,
	Separator,
}

interface WordSpan {
	readonly start: number;
	readonly end: number;
	readonly type: WordType;
	readonly nextClass: WordCharacterClass;
}

interface IntlWordSpan {
	readonly index: number;
	readonly segment: string;
}

class WordClassifier {
	private readonly _separators: ReadonlySet<string>;
	private readonly _segmenter: Intl.Segmenter | undefined;
	private _cachedLine: string | undefined;
	private _cachedWords: readonly IntlWordSpan[] = [];

	constructor(config: WordNavigationConfig) {
		this._separators = new Set(config.wordSeparators);
		this._segmenter = createWordSegmenter(config.wordSegmenterLocales);
	}

	classify(character: string | undefined): WordCharacterClass {
		if (character === undefined) {
			return WordCharacterClass.Whitespace;
		}
		if (character === ' ' || character === '\t') {
			return WordCharacterClass.Whitespace;
		}
		return this._separators.has(character)
			? WordCharacterClass.Separator
			: WordCharacterClass.Regular;
	}

	previousIntlWord(line: string, offset: number): IntlWordSpan | undefined {
		let candidate: IntlWordSpan | undefined;
		for (const word of this._intlWords(line)) {
			if (word.index > offset) { break; }
			candidate = word;
		}
		return candidate;
	}

	nextIntlWord(line: string, offset: number): IntlWordSpan | undefined {
		return this._intlWords(line).find(word => word.index >= offset);
	}

	private _intlWords(line: string): readonly IntlWordSpan[] {
		if (!this._segmenter) { return []; }
		if (this._cachedLine === line) { return this._cachedWords; }

		const words: IntlWordSpan[] = [];
		for (const segment of this._segmenter.segment(line)) {
			if (segment.isWordLike) {
				words.push({ index: segment.index, segment: segment.segment });
			}
		}
		this._cachedLine = line;
		this._cachedWords = words;
		return words;
	}
}

function createWordSegmenter(locales: readonly string[]): Intl.Segmenter | undefined {
	if (locales.length === 0) { return undefined; }
	const supportedLocales: string[] = [];
	for (const locale of locales as readonly unknown[]) {
		if (typeof locale !== 'string' || locale.length === 0) {
			console.warn('Ignoring invalid editor.wordSegmenterLocales entry', locale);
			continue;
		}
		try {
			supportedLocales.push(...Intl.Segmenter.supportedLocalesOf(locale));
		} catch (error) {
			console.warn(`Ignoring invalid editor.wordSegmenterLocales entry: ${locale}`, error);
		}
	}
	if (supportedLocales.length === 0) { return undefined; }
	try {
		return new Intl.Segmenter(supportedLocales, { granularity: 'word' });
	} catch (error) {
		console.warn(`Unable to initialize editor.wordSegmenterLocales: ${supportedLocales.join(', ')}`, error);
		return undefined;
	}
}

const classifierCache = new Map<string, WordClassifier>();

function getClassifier(config: WordNavigationConfig): WordClassifier {
	const key = `${config.wordSeparators}/${config.wordSegmenterLocales.join(',')}`;
	let classifier = classifierCache.get(key);
	if (!classifier) {
		classifier = new WordClassifier(config);
		classifierCache.set(key, classifier);
	}
	return classifier;
}

export function findWordBoundaryLeft(
	text: string,
	offset: number,
	config: WordNavigationConfig = DEFAULT_WORD_NAVIGATION_CONFIG,
): number {
	offset = clamp(offset, 0, text.length);
	if (offset === 0) { return 0; }

	let lineStart = text.lastIndexOf('\n', offset - 1) + 1;
	let lineEnd = text.indexOf('\n', offset);
	if (lineEnd === -1) { lineEnd = text.length; }
	let localOffset = offset - lineStart;
	if (localOffset === 0) {
		const previousLineEnd = lineStart - 1;
		lineStart = previousLineEnd <= 0
			? 0
			: text.lastIndexOf('\n', previousLineEnd - 1) + 1;
		lineEnd = previousLineEnd;
		localOffset = Math.max(0, previousLineEnd - lineStart);
	}

	const line = text.slice(lineStart, lineEnd);
	const classifier = getClassifier(config);
	let previous = findPreviousWord(line, classifier, localOffset);
	if (
		previous?.type === WordType.Separator
		&& previous.end - previous.start === 1
		&& previous.nextClass === WordCharacterClass.Regular
	) {
		previous = findPreviousWord(line, classifier, previous.start);
	}
	return lineStart + (previous?.start ?? 0);
}

export function findWordBoundaryRight(
	text: string,
	offset: number,
	config: WordNavigationConfig = DEFAULT_WORD_NAVIGATION_CONFIG,
): number {
	offset = clamp(offset, 0, text.length);
	if (offset === text.length) { return text.length; }

	let lineStart = text.lastIndexOf('\n', offset - 1) + 1;
	let lineEnd = text.indexOf('\n', offset);
	if (lineEnd === -1) { lineEnd = text.length; }
	let localOffset = offset - lineStart;
	if (offset === lineEnd && lineEnd < text.length) {
		lineStart = lineEnd + 1;
		lineEnd = text.indexOf('\n', lineStart);
		if (lineEnd === -1) { lineEnd = text.length; }
		localOffset = 0;
	}

	const line = text.slice(lineStart, lineEnd);
	const classifier = getClassifier(config);
	let next = findNextWord(line, classifier, localOffset);
	if (
		next?.type === WordType.Separator
		&& next.end - next.start === 1
		&& next.nextClass === WordCharacterClass.Regular
	) {
		next = findNextWord(line, classifier, next.end);
	}
	return lineStart + (next?.end ?? line.length);
}

export function findWordDeleteBoundaryLeft(
	text: string,
	offset: number,
	config: WordNavigationConfig = DEFAULT_WORD_NAVIGATION_CONFIG,
): number {
	offset = clamp(offset, 0, text.length);
	if (offset === 0) { return 0; }

	const lineStart = offset === 0 ? 0 : text.lastIndexOf('\n', offset - 1) + 1;
	const localOffset = offset - lineStart;
	if (localOffset === 0) {
		return offset - 1;
	}

	let lastNonWhitespace = localOffset - 1;
	while (
		lastNonWhitespace >= 0
		&& (text[lineStart + lastNonWhitespace] === ' ' || text[lineStart + lastNonWhitespace] === '\t')
	) {
		lastNonWhitespace--;
	}
	if (lastNonWhitespace + 1 < localOffset - 1) {
		return lineStart + lastNonWhitespace + 1;
	}

	let lineEnd = text.indexOf('\n', offset);
	if (lineEnd === -1) { lineEnd = text.length; }
	const line = text.slice(lineStart, lineEnd);
	const previous = findPreviousWord(line, getClassifier(config), localOffset);
	return lineStart + (previous?.start ?? 0);
}

export function findWordDeleteBoundaryRight(
	text: string,
	offset: number,
	config: WordNavigationConfig = DEFAULT_WORD_NAVIGATION_CONFIG,
): number {
	offset = clamp(offset, 0, text.length);
	if (offset === text.length) { return text.length; }

	const lineStart = text.lastIndexOf('\n', offset - 1) + 1;
	let lineEnd = text.indexOf('\n', offset);
	if (lineEnd === -1) { lineEnd = text.length; }
	const localOffset = offset - lineStart;
	const line = text.slice(lineStart, lineEnd);

	let firstNonWhitespace = localOffset;
	while (
		firstNonWhitespace < line.length
		&& (line[firstNonWhitespace] === ' ' || line[firstNonWhitespace] === '\t')
	) {
		firstNonWhitespace++;
	}
	if (localOffset < firstNonWhitespace) {
		return lineStart + firstNonWhitespace;
	}

	const classifier = getClassifier(config);
	const next = findNextWord(line, classifier, localOffset);
	if (next) {
		return lineStart + next.end;
	}
	if (offset < lineEnd || lineEnd === text.length) {
		return lineEnd;
	}

	const nextLineStart = lineEnd + 1;
	let nextLineEnd = text.indexOf('\n', nextLineStart);
	if (nextLineEnd === -1) { nextLineEnd = text.length; }
	const nextLine = text.slice(nextLineStart, nextLineEnd);
	const nextLineWord = findNextWord(nextLine, classifier, 0);
	return nextLineStart + (nextLineWord?.start ?? nextLine.length);
}

export function findWordAt(
	text: string,
	offset: number,
	config: WordNavigationConfig = DEFAULT_WORD_NAVIGATION_CONFIG,
): { start: number; end: number } {
	offset = clamp(offset, 0, text.length);
	if (offset === text.length) {
		return { start: offset, end: offset };
	}

	const character = text[offset];
	if (/\s/u.test(character)) {
		let start = offset;
		let end = offset + 1;
		while (start > 0 && /\s/u.test(text[start - 1])) { start--; }
		while (end < text.length && /\s/u.test(text[end])) { end++; }
		return { start, end };
	}

	const lineStart = text.lastIndexOf('\n', offset - 1) + 1;
	let lineEnd = text.indexOf('\n', offset);
	if (lineEnd === -1) { lineEnd = text.length; }
	const line = text.slice(lineStart, lineEnd);
	const localOffset = offset - lineStart;
	const classifier = getClassifier(config);

	const intlWord = classifier.previousIntlWord(line, localOffset);
	if (intlWord && localOffset < intlWord.index + intlWord.segment.length) {
		return {
			start: lineStart + intlWord.index,
			end: lineStart + intlWord.index + intlWord.segment.length,
		};
	}

	const characterClass = classifier.classify(character);
	let start = localOffset;
	let end = localOffset + 1;
	while (start > 0 && classifier.classify(line[start - 1]) === characterClass) { start--; }
	while (end < line.length && classifier.classify(line[end]) === characterClass) { end++; }
	return { start: lineStart + start, end: lineStart + end };
}

function findPreviousWord(line: string, classifier: WordClassifier, offset: number): WordSpan | undefined {
	let type: WordType | undefined;
	const previousIntlWord = classifier.previousIntlWord(line, offset - 1);

	for (let index = offset - 1; index >= 0; index--) {
		const characterClass = classifier.classify(line[index]);
		if (previousIntlWord && index === previousIntlWord.index) {
			return {
				start: previousIntlWord.index,
				end: previousIntlWord.index + previousIntlWord.segment.length,
				type: WordType.Regular,
				nextClass: characterClass,
			};
		}

		if (characterClass === WordCharacterClass.Regular) {
			if (type === WordType.Separator) {
				const start = index + 1;
				return { start, end: findWordEnd(line, classifier, type, start), type, nextClass: characterClass };
			}
			type = WordType.Regular;
		} else if (characterClass === WordCharacterClass.Separator) {
			if (type === WordType.Regular) {
				const start = index + 1;
				return { start, end: findWordEnd(line, classifier, type, start), type, nextClass: characterClass };
			}
			type = WordType.Separator;
		} else if (type !== undefined) {
			const start = index + 1;
			return { start, end: findWordEnd(line, classifier, type, start), type, nextClass: characterClass };
		}
	}

	return type === undefined
		? undefined
		: { start: 0, end: findWordEnd(line, classifier, type, 0), type, nextClass: WordCharacterClass.Whitespace };
}

function findNextWord(line: string, classifier: WordClassifier, offset: number): WordSpan | undefined {
	let type: WordType | undefined;
	const nextIntlWord = classifier.nextIntlWord(line, offset);

	for (let index = offset; index < line.length; index++) {
		const characterClass = classifier.classify(line[index]);
		if (nextIntlWord && index === nextIntlWord.index) {
			return {
				start: nextIntlWord.index,
				end: nextIntlWord.index + nextIntlWord.segment.length,
				type: WordType.Regular,
				nextClass: characterClass,
			};
		}

		if (characterClass === WordCharacterClass.Regular) {
			if (type === WordType.Separator) {
				const end = index;
				return { start: findWordStart(line, classifier, type, end - 1), end, type, nextClass: characterClass };
			}
			type = WordType.Regular;
		} else if (characterClass === WordCharacterClass.Separator) {
			if (type === WordType.Regular) {
				const end = index;
				return { start: findWordStart(line, classifier, type, end - 1), end, type, nextClass: characterClass };
			}
			type = WordType.Separator;
		} else if (type !== undefined) {
			const end = index;
			return { start: findWordStart(line, classifier, type, end - 1), end, type, nextClass: characterClass };
		}
	}

	return type === undefined
		? undefined
		: {
			start: findWordStart(line, classifier, type, line.length - 1),
			end: line.length,
			type,
			nextClass: WordCharacterClass.Whitespace,
		};
}

function findWordEnd(line: string, classifier: WordClassifier, type: WordType, start: number): number {
	const nextIntlWord = classifier.nextIntlWord(line, start);
	for (let index = start; index < line.length; index++) {
		if (nextIntlWord && index === nextIntlWord.index + nextIntlWord.segment.length) {
			return index;
		}
		const characterClass = classifier.classify(line[index]);
		if (
			characterClass === WordCharacterClass.Whitespace
			|| (type === WordType.Regular && characterClass === WordCharacterClass.Separator)
			|| (type === WordType.Separator && characterClass === WordCharacterClass.Regular)
		) {
			return index;
		}
	}
	return line.length;
}

function findWordStart(line: string, classifier: WordClassifier, type: WordType, start: number): number {
	const previousIntlWord = classifier.previousIntlWord(line, start);
	for (let index = start; index >= 0; index--) {
		if (previousIntlWord && index === previousIntlWord.index) {
			return index;
		}
		const characterClass = classifier.classify(line[index]);
		if (
			characterClass === WordCharacterClass.Whitespace
			|| (type === WordType.Regular && characterClass === WordCharacterClass.Separator)
			|| (type === WordType.Separator && characterClass === WordCharacterClass.Regular)
		) {
			return index + 1;
		}
	}
	return 0;
}

function clamp(value: number, min: number, max: number): number {
	return Math.min(Math.max(value, min), max);
}
