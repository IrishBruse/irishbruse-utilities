import { describe, expect, it } from 'vitest';
import { findWordAt } from '@vscode/markdown-editor';
import { selectionForWordDrag } from './wordDragSelection';

const source = 'alpha beta gamma';

describe('selectionForWordDrag', () => {
	const betaOffset = source.indexOf('beta');
	const beta = findWordAt(source, betaOffset);

	it('drag right selects through the end of the later word', () => {
		const gammaOffset = source.indexOf('gamma');
		const gamma = findWordAt(source, gammaOffset);
		const selection = selectionForWordDrag(beta, gammaOffset, gamma);
		expect(selection.anchor).toBe(beta.start);
		expect(selection.active).toBe(gamma.end);
		expect(source.slice(selection.range.start, selection.range.endExclusive)).toBe('beta gamma');
	});

	it('drag left selects from the start of the earlier word through the end of the original word', () => {
		const alphaOffset = source.indexOf('alpha');
		const alpha = findWordAt(source, alphaOffset);
		const selection = selectionForWordDrag(beta, alphaOffset, alpha);
		expect(selection.anchor).toBe(beta.end);
		expect(selection.active).toBe(alpha.start);
		expect(source.slice(selection.range.start, selection.range.endExclusive)).toBe('alpha beta');
	});

	it('pointer still inside the original word keeps that word', () => {
		const inside = betaOffset + 1;
		const selection = selectionForWordDrag(beta, inside, findWordAt(source, inside));
		expect(selection.anchor).toBe(beta.start);
		expect(selection.active).toBe(beta.end);
		expect(source.slice(selection.range.start, selection.range.endExclusive)).toBe('beta');
	});
});
