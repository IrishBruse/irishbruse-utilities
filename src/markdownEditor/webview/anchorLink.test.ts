import { readFileSync } from 'node:fs';
import { EditorModel, StringValue, findNodeOffsetById } from '@vscode/markdown-editor';
import { describe, expect, it } from 'vitest';
import { documentAnchor, sameDocumentFragment } from './anchorLink';

function parse(source: string) {
	const model = new EditorModel();
	model.sourceText.set(new StringValue(source), undefined);
	return model.document.get();
}

describe('sameDocumentFragment', () => {
	it('reads a hash href', () => {
		expect(sameDocumentFragment('#awesome-selfhosted')).toBe('awesome-selfhosted');
		expect(sameDocumentFragment('#')).toBe('');
		expect(sameDocumentFragment('./#software')).toBe('software');
	});

	it('decodes a percent-encoded fragment', () => {
		expect(sameDocumentFragment('#caf%C3%A9')).toBe('café');
	});

	it('leaves links to other documents alone', () => {
		expect(sameDocumentFragment('https://example.com#section')).toBeUndefined();
		expect(sameDocumentFragment('other.md#section')).toBeUndefined();
		expect(sameDocumentFragment('software')).toBeUndefined();
	});
});

describe('documentAnchor', () => {
	const source = `# Awesome-Selfhosted

### Calendar & Contacts

### Communication - Custom Communication Systems

## Hello \`code\`

## [Link text](https://example.com)

## Image ![alt words](img.png) here

## Duplicate

## Duplicate
`;

	it('matches GitHub heading anchors, including punctuation and duplicates', () => {
		const doc = parse(source);
		expect(documentAnchor(doc, '#awesome-selfhosted')).toMatchObject({ kind: 'heading', offset: 0 });
		expect(documentAnchor(doc, '#calendar--contacts')?.kind).toBe('heading');
		expect(documentAnchor(doc, '#communication---custom-communication-systems')?.kind).toBe('heading');
		expect(documentAnchor(doc, '#hello-code')?.kind).toBe('heading');
		expect(documentAnchor(doc, '#link-text')?.kind).toBe('heading');
		expect(documentAnchor(doc, '#image-alt-words-here')?.kind).toBe('heading');

		const first = documentAnchor(doc, '#duplicate');
		const second = documentAnchor(doc, '#duplicate-1');
		expect(first?.kind).toBe('heading');
		expect(second?.kind).toBe('heading');
		if (first?.kind === 'heading' && second?.kind === 'heading') {
			expect(second.offset).toBeGreaterThan(first.offset);
			expect(source.slice(first.offset, first.offset + 12)).toBe('## Duplicate');
		}
	});

	it('scrolls a bare hash to the top and ignores unknown fragments', () => {
		const doc = parse(source);
		expect(documentAnchor(doc, '#')).toEqual({ kind: 'top' });
		expect(documentAnchor(doc, '#missing')).toBeUndefined();
		expect(documentAnchor(doc, 'https://example.com')).toBeUndefined();
	});

	it('resolves every in-page anchor in awesome-selfhosted', () => {
		const text = readFileSync('docs/tests/markdown/large/awesome-selfhosted.md', 'utf8');
		const doc = parse(text);
		const missing: string[] = [];
		const seen = new Set<string>();
		for (const match of text.matchAll(/\]\(#([^)\s]+)\)/g)) {
			const fragment = match[1];
			if (seen.has(fragment)) {
				continue;
			}
			seen.add(fragment);
			if (!documentAnchor(doc, `#${fragment}`)) {
				missing.push(fragment);
			}
		}
		expect(missing).toEqual([]);
		expect(seen.size).toBeGreaterThan(10);
		const top = documentAnchor(doc, '#awesome-selfhosted');
		expect(top?.kind).toBe('heading');
		if (top?.kind === 'heading') {
			expect(findNodeOffsetById(doc, top.heading)).toBe(0);
		}
	});
});
