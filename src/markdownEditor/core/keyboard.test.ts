import { describe, expect, it } from 'vitest';
import { lineBounds, lineSelectionBounds, dragLineSelection, dragWordSelection, toggleInlineWrap, wordBounds } from './keyboard';

function applyWrap(source: string, start: number, end: number, marker: string) {
	const edit = toggleInlineWrap(source, start, end, marker);
	return {
		text: source.slice(0, edit.start) + edit.text + source.slice(edit.endExclusive),
		anchor: edit.anchor,
		active: edit.active,
	};
}

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

describe('dragWordSelection', () => {
	it('keeps the origin word and grows to later words', () => {
		expect(dragWordSelection('one two three', 1, 8)).toEqual({ anchor: 0, active: 13 });
	});

	it('grows backward to earlier words', () => {
		expect(dragWordSelection('one two three', 5, 1)).toEqual({ anchor: 7, active: 0 });
	});
});

describe('dragLineSelection', () => {
	it('grows to later lines including the newline', () => {
		expect(dragLineSelection('ab\ncd\nef', 1, 4)).toEqual({ anchor: 0, active: 6 });
	});
});

describe('toggleInlineWrap', () => {
	it('wraps a selection in bold markers', () => {
		expect(applyWrap('say hello now', 4, 9, '**')).toEqual({
			text: 'say **hello** now',
			anchor: 6,
			active: 11,
		});
	});

	it('unwraps matching bold markers around a selection', () => {
		expect(applyWrap('say **hello** now', 6, 11, '**')).toEqual({
			text: 'say hello now',
			anchor: 4,
			active: 9,
		});
	});

	it('unwraps when the selection includes the markers', () => {
		expect(applyWrap('**hello**', 0, 9, '**')).toEqual({
			text: 'hello',
			anchor: 0,
			active: 5,
		});
	});

	it('adds italic on bold without removing the bold markers', () => {
		expect(applyWrap('**hello**', 2, 7, '*')).toEqual({
			text: '***hello***',
			anchor: 3,
			active: 8,
		});
	});

	it('wraps a selection in backticks instead of replacing it', () => {
		expect(applyWrap('use foo here', 4, 7, '`')).toEqual({
			text: 'use `foo` here',
			anchor: 5,
			active: 8,
		});
	});

	it('inserts a marker pair at a collapsed caret with no word', () => {
		expect(applyWrap('   ', 1, 1, '**')).toEqual({
			text: ' ****  ',
			anchor: 3,
			active: 3,
		});
	});

	it('wraps the word under a collapsed caret', () => {
		expect(applyWrap('hello', 2, 2, '*')).toEqual({
			text: '*hello*',
			anchor: 1,
			active: 6,
		});
	});
});
