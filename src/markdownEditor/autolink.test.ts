import { EditorModel, StringValue, visualizeAst } from '@vscode/markdown-editor';
import { describe, expect, it } from 'vitest';

function visualize(source: string): string {
	const model = new EditorModel();
	model.sourceText.set(new StringValue(source), undefined);
	return JSON.stringify(visualizeAst(model.document.get(), source));
}

describe('GFM autolinks', () => {
	it('parses angle-bracket autolinks as links', () => {
		const labels = visualize('- <https://example.com>\n');
		expect(labels).toContain('link');
		expect(labels).toContain('https://example.com');
		expect(labels).not.toContain('glue \\"<https://example.com>\\"');
	});

	it('parses bare URL autolinks as links', () => {
		const labels = visualize('https://example.com\n');
		expect(labels).toContain('link');
		expect(labels).toContain('https://example.com');
	});
});
