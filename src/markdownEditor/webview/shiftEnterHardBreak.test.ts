import { describe, expect, it } from 'vitest';
import { EditorModel, Selection, StringValue } from '@vscode/markdown-editor';
import { applyShiftEnterAtBlockEnd } from './shiftEnterHardBreak';

function modelWith(source: string, offset: number): EditorModel {
	const model = new EditorModel();
	model.sourceText.set(new StringValue(source), undefined);
	model.selection.set(Selection.collapsed(offset), undefined);
	return model;
}

describe('applyShiftEnterAtBlockEnd', () => {
	it('opens a line after trailing spaces at the end of a paragraph', () => {
		const source = 'Checklist:\n\n1. Header\n';
		const model = modelWith(source, source.indexOf('\n'));
		expect(applyShiftEnterAtBlockEnd(model)).toBe(true);
		expect(model.pendingParagraph.get()).toBeDefined();
		model.materializePendingParagraph('H');
		expect(model.sourceText.get().value).toBe('Checklist:  \nH\n\n1. Header\n');
	});

	it('treats spaces typed into the block gap as the hard break', () => {
		const source = 'Checklist:\n  \n1. Header\n';
		const caret = source.indexOf('\n  \n') + '\n  '.length;
		const model = modelWith(source, caret);
		expect(applyShiftEnterAtBlockEnd(model)).toBe(true);
		model.materializePendingParagraph('Next');
		expect(model.sourceText.get().value).toBe('Checklist:  \nNext\n\n1. Header\n');
	});

	it('leaves a hard break in the middle of a paragraph to the normal command', () => {
		const source = 'Hello\nWorld\n\n';
		const model = modelWith(source, 'Hello'.length);
		expect(applyShiftEnterAtBlockEnd(model)).toBe(false);
		expect(model.sourceText.get().value).toBe(source);
	});

	it('hard-breaks the last line of a list item', () => {
		const source = '- Alpha\n\n- Beta\n';
		const model = modelWith(source, '- Alpha'.length);
		expect(applyShiftEnterAtBlockEnd(model)).toBe(true);
		model.materializePendingParagraph('H');
		expect(model.sourceText.get().value).toBe('- Alpha  \nH\n\n- Beta\n');
	});
});
