import { describe, expect, it } from 'vitest';
import { hasYamlFrontMatter, readYamlFrontMatter } from './yamlFrontMatter';

describe('readYamlFrontMatter', () => {
	it('parses a closed block at the top of the file', () => {
		const text = '---\ntitle: Showcase\ndraft: false\n---\n\n# Body\n';
		const span = readYamlFrontMatter(text);
		expect(span).toEqual({
			yamlStart: 4,
			yamlEnd: 33,
			end: 37,
			yaml: 'title: Showcase\ndraft: false\n',
		});
	});

	it('rejects markdown without front matter', () => {
		expect(readYamlFrontMatter('# Hello\n')).toBeUndefined();
	});
});

describe('hasYamlFrontMatter', () => {
	it('is true for showcase-style front matter', () => {
		const text = '---\ntitle: Markdown Editor showcase\n---\n\nBody\n';
		expect(hasYamlFrontMatter(text)).toBe(true);
	});

	it('is false for ordinary markdown', () => {
		expect(hasYamlFrontMatter('---\nnot closed\n')).toBe(false);
	});
});
