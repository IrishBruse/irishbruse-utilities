import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { activeBlockMinHeightPx } from './activeBlockLayout';

const css = readFileSync(join(dirname(fileURLToPath(import.meta.url)), 'editorBase.css'), 'utf8');

function ruleBody(source: string, selector: string): string {
	const start = source.indexOf(`${selector} {`);
	if (start < 0) {
		throw new Error(`Missing CSS rule ${selector}`);
	}
	const open = source.indexOf('{', start);
	const close = source.indexOf('}', open);
	return source.slice(open + 1, close);
}

describe('activeBlockMinHeightPx', () => {
	it('keeps the idle height while the block is active', () => {
		expect(activeBlockMinHeightPx(true, 48)).toBe(48);
	});

	it('does not lock height for idle blocks', () => {
		expect(activeBlockMinHeightPx(false, 48)).toBeUndefined();
		expect(activeBlockMinHeightPx(true, 0)).toBeUndefined();
		expect(activeBlockMinHeightPx(true, undefined)).toBeUndefined();
	});
});

describe('editorBase.css active chrome', () => {
	it('pads every block, not only the active one', () => {
		expect(ruleBody(css, '.md-block')).toMatch(/padding:\s*8px 12px/);
		expect(ruleBody(css, '.md-block-active')).not.toMatch(/padding\s*:/);
	});

	it('does not add heading margin on both the wrapper and the inner heading', () => {
		expect(ruleBody(css, '.md-heading')).not.toMatch(/margin:/);
		expect(ruleBody(css, '.md-block.md-heading')).toMatch(/margin:/);
		expect(ruleBody(css, '.md-block.md-heading > .md-active-source')).toMatch(/margin:\s*0/);
	});

	it('paints the heading edit panel without changing the heading box', () => {
		expect(ruleBody(css, '.md-editor')).toMatch(/padding:\s*16px 48px 64px 4\.5em/);
		expect(ruleBody(css, '.md-block-active > .md-active-source')).not.toMatch(/margin:/);
		expect(ruleBody(css, '.md-block-active > .md-active-source')).not.toMatch(/padding:/);
		expect(ruleBody(css, '.md-block-active > .md-active-source::before')).toMatch(
			/inset:\s*-8px -12px/,
		);
		expect(ruleBody(css, '.md-heading-marker')).toMatch(/right:\s*100%/);
	});

	it('keeps the same list indent in idle and source mode', () => {
		expect(ruleBody(css, '.md-list')).toMatch(/padding-left:\s*1\.4em/);
		expect(ruleBody(css, '.md-block.md-list > .md-active-source')).toMatch(/padding-left:\s*1\.4em/);
		expect(ruleBody(css, '.md-line-marker')).toMatch(/text-align:\s*right/);
		expect(ruleBody(css, '.md-line-marker')).toMatch(/width:\s*var\(--md-line-marker-width/);
		expect(ruleBody(css, '.md-block-active')).toMatch(/background:\s*transparent/);
	});
});
