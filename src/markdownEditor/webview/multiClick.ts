/** Default Windows-like double-click timeout. */
export const MULTI_CLICK_MS = 500;
export const MULTI_CLICK_PX = 6;

export type MultiClickState = {
	count: number;
	time: number;
	x: number;
	y: number;
};

/**
 * Click count for pointerdown. `event.detail` stays 1 when `preventDefault`
 * runs on mousedown, so the editor tracks time and distance itself.
 */
export function nextMultiClickCount(
	previous: MultiClickState | undefined,
	time: number,
	x: number,
	y: number,
	shiftKey = false,
): MultiClickState {
	if (shiftKey || !previous) {
		return { count: 1, time, x, y };
	}
	const dt = time - previous.time;
	const dx = x - previous.x;
	const dy = y - previous.y;
	const chained = dt > 0 && dt <= MULTI_CLICK_MS && dx * dx + dy * dy <= MULTI_CLICK_PX * MULTI_CLICK_PX;
	return { count: chained ? previous.count + 1 : 1, time, x, y };
}
