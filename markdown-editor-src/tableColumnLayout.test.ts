import { describe, expect, it } from 'vitest';
import { allocateColumnWidths } from './tableColumnLayout';

describe('allocateColumnWidths', () => {
	it('keeps preferred widths when they fit', () => {
		expect(allocateColumnWidths([40, 50, 80], [40, 50, 200], 400)).toEqual([40, 50, 200]);
	});

	it('wraps the wide column before a short single-word column', () => {
		const widths = allocateColumnWidths([48, 72, 80], [48, 72, 600], 300);
		expect(widths[0]).toBeCloseTo(48);
		expect(widths[1]).toBeCloseTo(72);
		expect(widths[2]).toBeCloseTo(180);
	});

	it('scales all columns when even min widths overflow', () => {
		const widths = allocateColumnWidths([100, 100, 100], [100, 100, 100], 150);
		expect(widths.reduce((sum, width) => sum + width, 0)).toBeCloseTo(150);
		expect(widths[0]).toBeCloseTo(50);
	});
});
