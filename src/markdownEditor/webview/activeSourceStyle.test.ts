import { describe, expect, it } from 'vitest';
import { activeSourceStyles, headingBodyStart, headingDisplayText, headingMarkerPrefix, headingSourceForEdit, lineMarkerPrefix, styleClassName } from './activeSourceStyle';

describe('headingMarkerPrefix', () => {
	it('reads the ATX hashes and following space', () => {
		expect(headingMarkerPrefix('## Headings H1-H6')).toBe('## ');
		expect(headingMarkerPrefix('# Title')).toBe('# ');
		expect(headingMarkerPrefix('###### Small')).toBe('###### ');
		expect(headingMarkerPrefix('Heading 3')).toBe('');
	});

	it('drops a trailing newline so edit mode matches the idle heading line', () => {
		expect(headingSourceForEdit('## Headings H1-H6\n')).toBe('## Headings H1-H6');
		expect(headingSourceForEdit('## Headings H1-H6')).toBe('## Headings H1-H6');
	});

	it('maps displayed heading text after the hash prefix', () => {
		expect(headingDisplayText('## Headings H1-H6\n')).toBe('Headings H1-H6');
		expect(headingBodyStart('## Headings H1-H6\n')).toBe(3);
		expect(headingBodyStart('# Title')).toBe(2);
	});
});

describe('lineMarkerPrefix', () => {
	it('reads ordered and bullet list markers', () => {
		expect(lineMarkerPrefix('1. Click a cell')).toBe('1. ');
		expect(lineMarkerPrefix('3. On a mermaid fence')).toBe('3. ');
		expect(lineMarkerPrefix('- item')).toBe('- ');
		expect(lineMarkerPrefix('> quote')).toBe('> ');
		expect(lineMarkerPrefix('plain')).toBe('');
	});
});

describe('activeSourceStyles', () => {
	it('does not restyle heading lines so heading color and size inherit', () => {
		const text = '## Headings H1-H6';
		expect(activeSourceStyles(text, true).every(style => style === '')).toBe(true);
	});

	it('marks list prefixes and bold spans', () => {
		const text = '1. Click a **table cell** now';
		const styles = activeSourceStyles(text, true);
		expect(styles.slice(0, 3).every(style => style === 'marker')).toBe(true);
		const bold = text.indexOf('table cell');
		expect(styles[bold]).toBe('strong');
		expect(styles[text.indexOf('**')]).toBe('strong');
	});

	it('marks inline code including the backticks', () => {
		const text = 'use `getValue()` here';
		const styles = activeSourceStyles(text, true);
		const open = text.indexOf('`');
		const close = text.lastIndexOf('`');
		expect(styles[open]).toBe('code');
		expect(styles[text.indexOf('getValue()')]).toBe('code');
		expect(styles[close]).toBe('code');
		expect(styleClassName('code')).toBe('md-inline-code');
	});

	it('skips inline styles when inline is false', () => {
		const text = '**bold**';
		expect(activeSourceStyles(text, false).every(style => style === '')).toBe(true);
	});
});
