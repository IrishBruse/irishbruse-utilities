import { describe, expect, it } from 'vitest';
import { locateDisplayedInSource, resolveSourceOffset, textOffsetWithin } from './sourceHit';

const TEXT = 3;
const ELEMENT = 1;

class FakeNode {
	readonly childNodes: FakeNode[] = [];
	parentElement: FakeElement | null = null;
	textContent: string | null;

	constructor(
		readonly nodeType: number,
		textContent: string | null = '',
	) {
		this.textContent = textContent;
	}
}

class FakeElement extends FakeNode {
	dataset: { sourceOffset?: string } = {};

	constructor(sourceOffset?: number) {
		super(ELEMENT, '');
		if (sourceOffset !== undefined) {
			this.dataset.sourceOffset = String(sourceOffset);
		}
	}

	append(...children: FakeNode[]): this {
		for (const child of children) {
			child.parentElement = this;
			this.childNodes.push(child);
		}
		this.textContent = this.childNodes.map(child => child.textContent ?? '').join('');
		return this;
	}
}

class FakeText extends FakeNode {
	constructor(value: string) {
		super(TEXT, value);
	}
}

describe('locateDisplayedInSource', () => {
	it('maps visible heading text after the hash prefix', () => {
		expect(locateDisplayedInSource('## Headings H1-H6\n', 'Headings H1-H6', 0)).toBe(3);
	});

	it('maps visible paragraph text inside markdown markers', () => {
		expect(locateDisplayedInSource('Hello **world** there', 'world', 0)).toBe(8);
		expect(locateDisplayedInSource('Hello **world** there', ' there', 13)).toBe(15);
	});
});

describe('textOffsetWithin', () => {
	it('counts characters before the caret in a marked run', () => {
		const text = new FakeText('Headings');
		const mark = new FakeElement(3).append(text);
		expect(textOffsetWithin(mark as unknown as Node, text as unknown as Node, 4)).toBe(4);
		expect(textOffsetWithin(mark as unknown as Node, mark as unknown as Node, 1)).toBe(8);
	});
});

describe('resolveSourceOffset', () => {
	it('adds the caret offset inside a heading hit mark instead of walking to the parent at 0', () => {
		const text = new FakeText('Headings H1-H6');
		const mark = new FakeElement(3).append(text);
		const heading = new FakeElement().append(mark);
		void heading;
		expect(resolveSourceOffset(text as unknown as Node, 8)).toBe(11);
	});
});
