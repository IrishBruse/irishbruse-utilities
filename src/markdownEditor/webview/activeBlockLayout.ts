/** Min height so a focused source block does not shrink and shift later blocks. */
export function activeBlockMinHeightPx(
	isActive: boolean,
	previousHeight: number | undefined,
): number | undefined {
	if (!isActive || previousHeight === undefined || previousHeight <= 0) {
		return undefined;
	}
	return previousHeight;
}
