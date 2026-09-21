import { describe, expect, it } from 'vitest';
import { lineBounds, lineSelectionBounds, wordBounds } from './keyboard';

describe('lineBounds', () => {
	it('returns the full string for a single line', () => {
		expect(lineBounds('hello', 3)).toEqual({ start: 0, end: 5 });
	});

	it('excludes the newline character', () => {
		expect(lineBounds('ab\ncd', 0)).toEqual({ start: 0, end: 2 });
		expect(lineBounds('ab\ncd', 3)).toEqual({ start: 3, end: 5 });
	});
});

describe('lineSelectionBounds', () => {
	it('includes a trailing newline when present', () => {
		expect(lineSelectionBounds('first\nsecond', 1)).toEqual({ start: 0, endExclusive: 6 });
		expect(lineSelectionBounds('first\nsecond', 7)).toEqual({ start: 6, endExclusive: 12 });
	});

	it('does not extend past the end of the file', () => {
		expect(lineSelectionBounds('last line', 4)).toEqual({ start: 0, endExclusive: 9 });
	});
});

describe('wordBounds', () => {
	it('handles an empty string', () => {
		expect(wordBounds('', 0)).toEqual({ start: 0, end: 0 });
		expect(wordBounds('', 5)).toEqual({ start: 0, end: 0 });
	});

	it('clamps offset past the end', () => {
		expect(wordBounds('hi', 99)).toEqual({ start: 0, end: 2 });
	});

	it('selects a word at the start and end', () => {
		expect(wordBounds('hello world', 0)).toEqual({ start: 0, end: 5 });
		expect(wordBounds('hello world', 5)).toEqual({ start: 0, end: 5 });
		expect(wordBounds('hello world', 11)).toEqual({ start: 6, end: 11 });
	});

	it('skips punctuation between words', () => {
		expect(wordBounds('foo.bar', 2)).toEqual({ start: 0, end: 3 });
		expect(wordBounds('foo.bar', 3)).toEqual({ start: 3, end: 4 });
		expect(wordBounds('foo.bar', 4)).toEqual({ start: 4, end: 7 });
	});

	it('prefers the word on the left across spaces', () => {
		expect(wordBounds('foo  bar', 4)).toEqual({ start: 0, end: 3 });
		expect(wordBounds('foo  bar', 5)).toEqual({ start: 5, end: 8 });
	});

	it('uses UTF-16 code units for astral characters', () => {
		const text = 'a𝌆b';
		expect(text.length).toBe(4);
		expect(wordBounds(text, 1)).toEqual({ start: 1, end: 3 });
		expect(wordBounds(text, 2)).toEqual({ start: 1, end: 3 });
	});

	it('selects unicode letters as one word', () => {
		expect(wordBounds('café résumé', 2)).toEqual({ start: 0, end: 4 });
	});
});
