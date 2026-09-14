import { describe, expect, it } from 'vitest';
import {
	VIRTUALIZE_AFTER_CHILDREN,
	childHeightsPx,
	mergeMountIndices,
	mountSegments,
	planDocumentMount,
	viewportChildRange,
	type MountChild,
} from './viewportVirtualization';

function child(id: number, length: number, kind = 'paragraph', isActive = false): MountChild {
	return { kind, isActive, view: { ast: { id, length } } };
}

describe('planDocumentMount', () => {
	it('does not virtualize short documents', () => {
		const children = Array.from({ length: VIRTUALIZE_AFTER_CHILDREN - 1 }, (_, i) => child(i, 20));
		const plan = planDocumentMount(children, { scrollTop: 0, height: 800 }, new Map());
		expect(plan.virtualized).toBe(false);
	});

	it('mounts only the first viewport at scroll 0', () => {
		const children = Array.from({ length: 200 }, (_, i) => child(i, 72));
		const plan = planDocumentMount(children, { scrollTop: 0, height: 200 }, new Map());
		expect(plan.virtualized).toBe(true);
		const ranges = plan.segments.filter(segment => segment.type === 'range');
		expect(ranges.length).toBe(1);
		expect(ranges[0].start).toBe(0);
		expect(ranges[0].end).toBeLessThan(children.length);
		const spacers = plan.segments.filter(segment => segment.type === 'spacer');
		expect(spacers.length).toBe(1);
		expect(spacers[0].start).toBe(ranges[0].end);
	});

	it('keeps an active block mounted when it is far from the viewport', () => {
		const children = Array.from({ length: 200 }, (_, i) => child(i, 72, 'paragraph', i === 180));
		const plan = planDocumentMount(children, { scrollTop: 0, height: 200 }, new Map());
		const ranges = plan.segments.filter(segment => segment.type === 'range');
		expect(ranges.some(range => range.start <= 180 && range.end > 180)).toBe(true);
	});
});

describe('viewportChildRange', () => {
	it('selects children that overlap the overscan window', () => {
		const heights = Array.from({ length: 10 }, () => 100);
		const tops = heights.map((_, i) => i * 100);
		const range = viewportChildRange(tops, heights, { scrollTop: 250, height: 100 }, 0);
		expect(range.start).toBe(2);
		expect(range.end).toBe(4);
	});
});

describe('mountSegments', () => {
	it('inserts spacers between disconnected mounted ranges', () => {
		const heights = [10, 10, 10, 10, 10];
		const segments = mountSegments([0, 4], heights);
		expect(segments).toEqual([
			{ type: 'range', start: 0, end: 1, height: 0 },
			{ type: 'spacer', start: 1, end: 4, height: 30 },
			{ type: 'range', start: 4, end: 5, height: 0 },
		]);
	});
});

describe('childHeightsPx', () => {
	it('prefers measured heights', () => {
		const heights = childHeightsPx([child(1, 1000)], new Map([[1, 42]]));
		expect(heights).toEqual([42]);
	});
});

describe('mergeMountIndices', () => {
	it('unions the viewport range with extra indices', () => {
		expect(mergeMountIndices(2, 4, [0, 9], 10)).toEqual([0, 2, 3, 9]);
	});
});
