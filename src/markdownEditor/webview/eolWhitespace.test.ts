import { describe, expect, it } from 'vitest';
import { isEolWhitespaceSpan, type WhitespaceWalkNode } from './eolWhitespace';

const ELEMENT_NODE = 1;
const TEXT_NODE = 3;

class WalkNode implements WhitespaceWalkNode {
	nextSibling: WalkNode | null = null;
	parentNode: WalkNode | null = null;
	firstChild: WalkNode | null = null;

	constructor(
		readonly nodeType: number,
		readonly textContent: string | null,
		readonly tagName?: string,
		private readonly classes: readonly string[] = [],
	) {}

	get classList() {
		return {
			contains: (name: string) => this.classes.includes(name),
		};
	}

	append(...children: WalkNode[]): this {
		let prev: WalkNode | null = null;
		for (const child of children) {
			child.parentNode = this;
			child.nextSibling = null;
			if (!this.firstChild) {
				this.firstChild = child;
			}
			if (prev) {
				prev.nextSibling = child;
			}
			prev = child;
		}
		return this;
	}
}

function text(value: string): WalkNode {
	return new WalkNode(TEXT_NODE, value);
}

function el(className: string, value = ''): WalkNode {
	return new WalkNode(ELEMENT_NODE, value, 'SPAN', className.split(' ').filter(Boolean));
}

describe('eolWhitespace', () => {
	it('marks trailing spaces before a newline, not in-sentence spaces', () => {
		const mid = el('md-ws-space', ' ');
		const doubleA = el('md-ws-space', ' ');
		const doubleB = el('md-ws-space', ' ');
		const trail1 = el('md-ws-space', ' ');
		const trail2 = el('md-ws-space', ' ');
		el('md-text').append(
			text('word'),
			mid,
			text('word'),
			doubleA,
			doubleB,
			text('word'),
			trail1,
			trail2,
			el('md-ws-newline', '\n'),
			text('next'),
		);
		expect([mid, doubleA, doubleB, trail1, trail2].map(isEolWhitespaceSpan)).toEqual([
			false,
			false,
			false,
			true,
			true,
		]);
	});

	it('does not mark indent spaces in glue before list content', () => {
		const indentA = el('md-ws-space', ' ');
		const indentB = el('md-ws-space', ' ');
		const glue = el('md-glue').append(indentA, indentB);
		const paragraph = el('md-paragraph').append(text('Nested'));
		el('md-list-item').append(glue, paragraph);
		expect(isEolWhitespaceSpan(indentA)).toBe(false);
		expect(isEolWhitespaceSpan(indentB)).toBe(false);
	});

	it('marks trailing spaces at the end of a paragraph before block-gap glyphs', () => {
		const trail = el('md-ws-space', ' ');
		const paragraph = el('md-paragraph').append(text('end'), trail);
		const gap = el('md-glue md-glue-blockGap').append(el('md-ws-blockbreak-glyph', '↵'));
		el('md-block').append(paragraph, gap);
		expect(isEolWhitespaceSpan(trail)).toBe(true);
	});

	it('does not mark a leading indent space beside text', () => {
		const lead = el('md-ws-space', ' ');
		el('md-text').append(lead, text('Indented'));
		expect(isEolWhitespaceSpan(lead)).toBe(false);
	});

	it('marks trailing spaces before a collapsed glue newline and the next heading', () => {
		const trail = el('md-ws-space', ' ');
		const paragraph = el('md-paragraph md-block').append(text('Below a rule.'), trail);
		const gap = el('md-glue md-glue-blockBreak').append(text('\n'));
		const heading = el('md-heading md-block').append(text('Tables'));
		el('md-editor-content').append(paragraph, gap, heading);
		expect(isEolWhitespaceSpan(trail)).toBe(true);
	});

	it('marks trailing spaces at the end of the last block when a caret overlay follows', () => {
		const trail = el('md-ws-space', ' ');
		const paragraph = el('md-paragraph md-block').append(text('test adsasd'), trail);
		const overlay = el('md-cursor').append(text('|'));
		el('md-editor').append(paragraph, overlay);
		expect(isEolWhitespaceSpan(trail)).toBe(true);
	});

	it('marks trailing-space glue at the end of a paragraph', () => {
		const glue = el('md-glue', ' ');
		el('md-paragraph md-block').append(text('test adsasd'), glue);
		expect(isEolWhitespaceSpan(glue)).toBe(true);
	});

	it('marks trailing spaces when a virtualization spacer follows the block', () => {
		const trail = el('md-ws-space', ' ');
		const paragraph = el('md-paragraph md-block').append(text('end'), trail);
		const spacer = el('ib-md-virtual-spacer');
		el('md-document').append(paragraph, spacer);
		expect(isEolWhitespaceSpan(trail)).toBe(true);
	});
});
