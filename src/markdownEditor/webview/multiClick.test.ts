import { describe, expect, it } from 'vitest';
import { MULTI_CLICK_MS, nextMultiClickCount } from './multiClick';

describe('nextMultiClickCount', () => {
	it('starts at 1', () => {
		expect(nextMultiClickCount(undefined, 100, 10, 10).count).toBe(1);
	});

	it('increments a second click in the same place', () => {
		const first = nextMultiClickCount(undefined, 100, 10, 10);
		expect(nextMultiClickCount(first, 250, 11, 10).count).toBe(2);
	});

	it('increments a third click to a line gesture', () => {
		const first = nextMultiClickCount(undefined, 100, 10, 10);
		const second = nextMultiClickCount(first, 200, 10, 10);
		expect(nextMultiClickCount(second, 300, 10, 10).count).toBe(3);
	});

	it('resets after the double-click timeout', () => {
		const first = nextMultiClickCount(undefined, 100, 10, 10);
		expect(nextMultiClickCount(first, 100 + MULTI_CLICK_MS + 1, 10, 10).count).toBe(1);
	});

	it('resets when the pointer moved too far', () => {
		const first = nextMultiClickCount(undefined, 100, 10, 10);
		expect(nextMultiClickCount(first, 150, 40, 10).count).toBe(1);
	});

	it('does not chain a Shift+click', () => {
		const first = nextMultiClickCount(undefined, 100, 10, 10);
		expect(nextMultiClickCount(first, 150, 10, 10, true).count).toBe(1);
	});
});
