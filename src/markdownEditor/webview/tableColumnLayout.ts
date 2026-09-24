/**
 * Shrink wide columns first so short columns keep their longest-word width.
 */
export function allocateColumnWidths(mins: number[], prefs: number[], available: number): number[] {
	const count = Math.min(mins.length, prefs.length);
	const widths = Array.from({ length: count }, (_, i) => Math.max(mins[i] ?? 0, prefs[i] ?? 0));
	if (count === 0 || available <= 0) {
		return widths;
	}

	const total = widths.reduce((sum, width) => sum + width, 0);
	if (total <= available) {
		return widths;
	}

	const extras = widths.map((width, i) => Math.max(0, width - (mins[i] ?? 0)));
	const extraSum = extras.reduce((sum, extra) => sum + extra, 0);
	const need = total - available;
	if (extraSum > 0) {
		const cutScale = Math.min(1, need / extraSum);
		for (let i = 0; i < count; i++) {
			widths[i] = (widths[i] ?? 0) - (extras[i] ?? 0) * cutScale;
		}
	}

	const afterExtras = widths.reduce((sum, width) => sum + width, 0);
	if (afterExtras <= available + 0.5) {
		return widths;
	}

	const minTotal = mins.reduce((sum, min) => sum + min, 0);
	if (minTotal <= 0) {
		const even = available / count;
		return widths.map(() => even);
	}
	const minScale = Math.min(1, available / minTotal);
	return mins.map(min => min * minScale);
}
