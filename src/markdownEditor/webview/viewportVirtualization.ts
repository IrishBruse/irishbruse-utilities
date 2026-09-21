export const VIRTUALIZE_AFTER_CHILDREN = 48;
export const VIEWPORT_OVERSCAN_PX = 1600;
export const DEFAULT_LINE_HEIGHT_PX = 22;
export const DEFAULT_VIEWPORT_HEIGHT_PX = 800;

export interface ViewportBox {
	readonly scrollTop: number;
	readonly height: number;
}

export interface MountChild {
	readonly kind: string;
	readonly isActive: boolean;
	readonly view: {
		readonly ast: {
			readonly id: number;
			readonly length: number;
		};
		readonly text?: string;
	};
}

export interface MountSegment {
	readonly type: 'spacer' | 'range';
	readonly start: number;
	readonly end: number;
	readonly height: number;
}

let viewport: ViewportBox = { scrollTop: 0, height: DEFAULT_VIEWPORT_HEIGHT_PX };
let heightByAstId = new Map<number, number>();
let lastRangeKey = '';
let lastChildCount = 0;
let lastTops: number[] = [];
let lastHeights: number[] = [];

export function estimateChildHeightPx(child: MountChild, measured: number | undefined): number {
	if (measured !== undefined && measured > 0) {
		return measured;
	}
	const length = Math.max(0, child.view.ast.length);
	if (child.kind === 'glue') {
		if (length === 0) {
			return 0;
		}
		return Math.max(length, 1) * (DEFAULT_LINE_HEIGHT_PX / 2);
	}
	if (child.kind === 'pendingParagraph') {
		return DEFAULT_LINE_HEIGHT_PX;
	}
	const lines = Math.max(1, Math.ceil(length / 72));
	return lines * DEFAULT_LINE_HEIGHT_PX;
}

export function childHeightsPx(children: readonly MountChild[], measuredByAstId: ReadonlyMap<number, number>): number[] {
	return children.map(child => estimateChildHeightPx(child, measuredByAstId.get(child.view.ast.id)));
}

export function cumulativeTops(heights: readonly number[]): { readonly tops: number[]; readonly total: number } {
	const tops: number[] = [];
	let y = 0;
	for (const height of heights) {
		tops.push(y);
		y += height;
	}
	return { tops, total: y };
}

function binarySearchFirstGreaterOrEqual(values: readonly number[], target: number): number {
	let lo = 0;
	let hi = values.length;
	while (lo < hi) {
		const mid = (lo + hi) >> 1;
		if (values[mid] < target) {
			lo = mid + 1;
		} else {
			hi = mid;
		}
	}
	return lo;
}

export function viewportChildRange(
	tops: readonly number[],
	_heights: readonly number[],
	box: ViewportBox,
	overscanPx = VIEWPORT_OVERSCAN_PX,
): { readonly start: number; readonly end: number } {
	if (tops.length === 0) {
		return { start: 0, end: 0 };
	}
	const y0 = Math.max(0, box.scrollTop - overscanPx);
	const y1 = box.scrollTop + Math.max(box.height, 1) + overscanPx;
	let start = binarySearchFirstGreaterOrEqual(tops, y0) - 1;
	if (start < 0) {
		start = 0;
	}
	let end = binarySearchFirstGreaterOrEqual(tops, y1);
	if (end <= start) {
		end = Math.min(tops.length, start + 1);
	}
	return { start, end };
}

export function extraMountIndices(children: readonly MountChild[]): number[] {
	const extra: number[] = [];
	for (let i = 0; i < children.length; i++) {
		const child = children[i];
		if (child.isActive || child.kind === 'pendingParagraph') {
			extra.push(i);
		}
	}
	return extra;
}

export function mergeMountIndices(
	rangeStart: number,
	rangeEnd: number,
	extra: readonly number[],
	childCount: number,
): number[] {
	const mounted = new Set<number>();
	for (let i = rangeStart; i < rangeEnd; i++) {
		mounted.add(i);
	}
	for (const index of extra) {
		if (index >= 0 && index < childCount) {
			mounted.add(index);
		}
	}
	return [...mounted].sort((a, b) => a - b);
}

export function mountSegments(mounted: readonly number[], heights: readonly number[]): MountSegment[] {
	if (mounted.length === 0) {
		const total = heights.reduce((sum, height) => sum + height, 0);
		return total > 0 ? [{ type: 'spacer', start: 0, end: heights.length, height: total }] : [];
	}
	const segments: MountSegment[] = [];
	let cursor = 0;
	const flushSpacer = (from: number, to: number): void => {
		if (to <= from) {
			return;
		}
		let height = 0;
		for (let i = from; i < to; i++) {
			height += heights[i] ?? 0;
		}
		if (height > 0) {
			segments.push({ type: 'spacer', start: from, end: to, height });
		}
	};
	let runStart = mounted[0] ?? 0;
	let runEnd = runStart + 1;
	flushSpacer(cursor, runStart);
	for (let i = 1; i < mounted.length; i++) {
		const index = mounted[i] ?? 0;
		if (index === runEnd) {
			runEnd++;
			continue;
		}
		segments.push({ type: 'range', start: runStart, end: runEnd, height: 0 });
		flushSpacer(runEnd, index);
		runStart = index;
		runEnd = index + 1;
	}
	segments.push({ type: 'range', start: runStart, end: runEnd, height: 0 });
	flushSpacer(runEnd, heights.length);
	return segments;
}

export function planDocumentMount(
	children: readonly MountChild[],
	box: ViewportBox,
	measuredByAstId: ReadonlyMap<number, number>,
): { readonly virtualized: boolean; readonly segments: MountSegment[]; readonly mountKey: string } {
	if (children.length < VIRTUALIZE_AFTER_CHILDREN) {
		return { virtualized: false, segments: [], mountKey: `full:${children.length}` };
	}
	const heights = childHeightsPx(children, measuredByAstId);
	const { tops } = cumulativeTops(heights);
	const range = viewportChildRange(tops, heights, box);
	const extra = extraMountIndices(children);
	const mounted = mergeMountIndices(range.start, range.end, extra, children.length);
	const segments = mountSegments(mounted, heights);
	rememberPlan(children.length, heights, rangeKey(range.start, range.end, extra));
	return {
		virtualized: true,
		segments,
		mountKey: rangeKey(range.start, range.end, extra),
	};
}

function rangeKey(start: number, end: number, extra: readonly number[]): string {
	return `v:${start}:${end}:${extra.join(',')}`;
}

export function recordMeasuredHeights(measurements: readonly { readonly block: { readonly id: number }; readonly height: number; readonly isMeasured: boolean }[]): void {
	for (const measurement of measurements) {
		if (measurement.isMeasured && measurement.height > 0) {
			heightByAstId.set(measurement.block.id, measurement.height);
		}
	}
}

export function setViewportBox(box: ViewportBox): void {
	viewport = box;
}

export function currentViewportBox(): ViewportBox {
	return viewport;
}

export function mountWindowChanged(): boolean {
	if (lastChildCount < VIRTUALIZE_AFTER_CHILDREN || !lastRangeKey.startsWith('v:')) {
		return false;
	}
	const range = viewportChildRange(lastTops, lastHeights, viewport);
	const parts = lastRangeKey.split(':');
	return range.start !== Number(parts[1]) || range.end !== Number(parts[2]);
}

function rememberPlan(childCount: number, heights: readonly number[], mountKey: string): void {
	lastChildCount = childCount;
	lastHeights = [...heights];
	lastTops = cumulativeTops(heights).tops;
	lastRangeKey = mountKey;
}

export function bindViewportVirtualization(view: { refreshEmbeddedCodeEditors(): void }, host: HTMLElement): () => void {
	let remountTimer = 0;
	const syncViewport = (remount: boolean): void => {
		const next: ViewportBox = {
			scrollTop: host.scrollTop,
			height: host.clientHeight || DEFAULT_VIEWPORT_HEIGHT_PX,
		};
		const previous = viewport;
		setViewportBox(next);
		const scrolled = Math.abs(previous.scrollTop - next.scrollTop) > 8
			|| Math.abs(previous.height - next.height) > 8;
		if (remount && scrolled && mountWindowChanged()) {
			view.refreshEmbeddedCodeEditors();
		}
	};
	const remountAfterScroll = (): void => {
		syncViewport(true);
	};
	syncViewport(false);
	const onScroll = (): void => {
		syncViewport(false);
		clearTimeout(remountTimer);
		remountTimer = window.setTimeout(remountAfterScroll, 80);
	};
	host.addEventListener('scroll', onScroll, { passive: true });
	const resizeObserver = new ResizeObserver(() => {
		syncViewport(true);
	});
	resizeObserver.observe(host);
	return () => {
		clearTimeout(remountTimer);
		host.removeEventListener('scroll', onScroll);
		resizeObserver.disconnect();
	};
}
