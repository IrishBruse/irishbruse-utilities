import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { patchMarkdownEditor } from './patchMarkdownEditor.mjs';

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

describe('patchMarkdownEditor', () => {
	it('hooks DocumentViewNode.create for viewport virtualization', () => {
		const source = readFileSync(markdownEditorIndex, 'utf8');
		const patched = patchMarkdownEditor(source);
		expect(patched).toContain('globalThis.__ibMdDocumentViewCreate');
		expect(patched).toContain('originalCreate');
		expect(patched).toContain('createViewNode: J');
	});
});
