import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { patchMarkdownEditorParse } from './patchMarkdownEditor.mjs';

const markdownEditorIndex = join(
	dirname(fileURLToPath(import.meta.url)),
	'..',
	'..',
	'node_modules',
	'@vscode',
	'markdown-editor',
	'dist',
	'index.js',
);

describe('patchMarkdownEditorParse', () => {
	it('keeps autolink and htmlText as raw source text', () => {
		const source = readFileSync(markdownEditorIndex, 'utf8');
		const patched = patchMarkdownEditorParse(source);
		expect(patched).toContain('case "autolink":');
		expect(patched).toContain('case "htmlText":');
		expect(patched).toContain('_parseRawInline(t.tokenType)');
		expect(patched).toContain('new Qe(this._source.substring(e.startOffset, r.endOffset))');
	});
});
