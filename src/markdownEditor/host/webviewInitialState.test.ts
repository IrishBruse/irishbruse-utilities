import { describe, expect, it } from 'vitest';
import { prefixMarkdownForFastOpen } from './webviewInitialState';

describe('prefixMarkdownForFastOpen', () => {
	it('keeps short files unchanged', () => {
		expect(prefixMarkdownForFastOpen('# hi\n', 16)).toBe('# hi\n');
	});

	it('cuts at the last newline in the budget', () => {
		const text = 'aaa\nbbb\nccc\n';
		expect(prefixMarkdownForFastOpen(text, 8)).toBe('aaa\nbbb\n');
	});
});
