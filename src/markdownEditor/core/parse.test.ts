import { describe, expect, it } from 'vitest';
import { EditorModel, Selection, StringValue, applyHardBreak, applySmartEnter, parseMarkdown, toggleTaskAt } from './index';

describe('parseMarkdown', () => {
	it('keeps source offsets on headings, tables, and fences', () => {
		const source = `# Title

| A | B |
| --- | --- |
| 1 | 2 |

\`\`\`js
const x = 1
\`\`\`

<https://example.com>
`;
		const doc = parseMarkdown(source);
		expect(doc.blocks.some(block => block.kind === 'heading' && source.slice(block.start, block.end).includes('Title'))).toBe(true);
		expect(doc.blocks.some(block => block.kind === 'table')).toBe(true);
		expect(doc.blocks.some(block => block.kind === 'code')).toBe(true);
		const paragraph = doc.blocks.find(block => block.kind === 'paragraph' && source.slice(block.start, block.end).includes('https://example.com'));
		expect(paragraph).toBeTruthy();
		expect(source.slice(paragraph!.start, paragraph!.end)).toContain('<https://example.com>');
	});

	it('parses yaml front matter and math fences', () => {
		const source = `---
name: demo
---

$$
a^2
$$
`;
		const doc = parseMarkdown(source);
		expect(doc.blocks[0]?.kind).toBe('frontMatter');
		expect(doc.blocks.some(block => block.kind === 'math')).toBe(true);
	});

	it('keeps an ordered list as one block with source offsets', () => {
		const source = `1. Click a **table cell**
2. Leave a **code fence**
`;
		const doc = parseMarkdown(source);
		const list = doc.blocks.find(block => block.kind === 'list');
		expect(list).toBeTruthy();
		expect(source.slice(list!.start, list!.end)).toContain('**table cell**');
		expect(source.slice(list!.start, list!.end)).toContain('**code fence**');
	});

	it('parses nested lists and GFM tasks', () => {
		const source = `- Parent
  - Child
- [ ] Open
- [x] Done
`;
		const doc = parseMarkdown(source);
		expect(doc.blocks.filter(block => block.kind === 'list')).toHaveLength(1);
		const list = doc.blocks[0]!;
		expect(source.slice(list.start, list.end)).toContain('[x]');
	});
});

describe('EditorModel', () => {
	it('maps the caret through replaceSourceText', () => {
		const model = new EditorModel();
		model.sourceText.set(new StringValue('hello world'), undefined);
		model.selection.set(new Selection(11, 11), undefined);
		model.replaceSourceText(new StringValue('hello'));
		expect(model.selection.get()?.active).toBe(5);
	});

	it('applyEdit replaces a range and moves the caret', () => {
		const model = new EditorModel();
		model.sourceText.set(new StringValue('abc'), undefined);
		model.replaceRange(1, 2, 'X', 2);
		expect(model.getText()).toBe('aXc');
		expect(model.selection.get()?.active).toBe(2);
	});
});

describe('keyboard', () => {
	it('continues a list on Enter', () => {
		const edit = applySmartEnter('- item', 6);
		expect(edit.text).toBe('\n- ');
	});

	it('inserts a hard break', () => {
		const edit = applyHardBreak(3);
		expect(edit.text).toBe('  \n');
		expect(edit.caret).toBe(6);
	});

	it('toggles a task checkbox on one line', () => {
		const change = toggleTaskAt('- [ ] task', 4, true);
		expect(change).toEqual({ start: 2, endExclusive: 5, text: '[x]' });
	});
});
