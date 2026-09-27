import { Point2D, Rect2D } from '../core/geometry.js';

const SCROLL_POSITION_TOLERANCE = 1;

/** A scroll event target and its requested destination in layout CSS pixels. */
export interface ScrollDestination {
	readonly eventTarget: Element | Document;
	isReached(): boolean;
}

export function getElementScrollDestination(element: HTMLElement, left: number, top: number): ScrollDestination | undefined {
	if (hasViewportPropagatedOverflow(element)) { return undefined; }
	const doc = element.ownerDocument;
	if (element === doc.scrollingElement) {
		return getWindowScrollDestination(doc.defaultView ?? window, left, top);
	}
	const position = clampScrollPosition(element, left, top, element.clientWidth, element.clientHeight);
	return {
		eventTarget: element,
		isReached: () => isScrollPositionReached(element.scrollLeft, element.scrollTop, position),
	};
}

export function getWindowScrollDestination(win: Window, left: number, top: number): ScrollDestination {
	const doc = win.document;
	const position = clampScrollPosition(
		doc.scrollingElement ?? doc.documentElement,
		left,
		top,
		doc.documentElement.clientWidth || win.innerWidth,
		doc.documentElement.clientHeight || win.innerHeight,
	);
	return {
		eventTarget: doc,
		isReached: () => isScrollPositionReached(win.scrollX, win.scrollY, position),
	};
}

function clampScrollPosition(element: Element, left: number, top: number, width: number, height: number): Point2D {
	const maxLeft = Math.max(0, element.scrollWidth - width);
	const maxTop = Math.max(0, element.scrollHeight - height);
	const rtl = (element.ownerDocument.defaultView ?? window).getComputedStyle(element).direction === 'rtl';
	return new Point2D(
		rtl ? Math.max(-maxLeft, Math.min(0, left)) : Math.max(0, Math.min(maxLeft, left)),
		Math.max(0, Math.min(maxTop, top)),
	);
}

function isScrollPositionReached(left: number, top: number, position: Point2D): boolean {
	return Math.abs(left - position.x) <= SCROLL_POSITION_TOLERANCE
		&& Math.abs(top - position.y) <= SCROLL_POSITION_TOLERANCE;
}

export function getClippingClientRect(element: Element): Rect2D {
	const doc = element.ownerDocument;
	const win = doc.defaultView ?? window;
	let result = Rect2D.fromPointSize(
		0,
		0,
		doc.documentElement.clientWidth || win.innerWidth,
		doc.documentElement.clientHeight || win.innerHeight,
	);

	for (let parent = element.parentElement; parent; parent = parent.parentElement) {
		const style = win.getComputedStyle(parent);
		const clipsX = clipsOverflow(style.overflowX);
		const clipsY = clipsOverflow(style.overflowY);
		if (!clipsX && !clipsY) { continue; }

		const rect = getElementClientRect(parent);
		const left = clipsX ? Math.max(result.left, rect.left) : result.left;
		const right = clipsX ? Math.min(result.right, rect.right) : result.right;
		const top = clipsY ? Math.max(result.top, rect.top) : result.top;
		const bottom = clipsY ? Math.min(result.bottom, rect.bottom) : result.bottom;
		if (right <= left || bottom <= top) {
			return Rect2D.fromPointSize(left, top, 0, 0);
		}
		result = Rect2D.fromPointPoint(
			left,
			top,
			right,
			bottom,
		);
	}
	return result;
}

export function getElementClientRect(element: HTMLElement): Rect2D {
	const bounds = element.getBoundingClientRect();
	const scaleX = element.offsetWidth > 0 ? bounds.width / element.offsetWidth : 1;
	const scaleY = element.offsetHeight > 0 ? bounds.height / element.offsetHeight : 1;
	return Rect2D.fromPointSize(
		bounds.left + element.clientLeft * scaleX,
		bounds.top + element.clientTop * scaleY,
		element.clientWidth * scaleX,
		element.clientHeight * scaleY,
	);
}

export function clientDeltaToScrollDelta(element: HTMLElement, deltaX: number, deltaY: number): { readonly x: number; readonly y: number } {
	const bounds = element.getBoundingClientRect();
	const scaleX = element.offsetWidth > 0 ? bounds.width / element.offsetWidth : 1;
	const scaleY = element.offsetHeight > 0 ? bounds.height / element.offsetHeight : 1;
	return {
		x: deltaX / scaleX,
		y: deltaY / scaleY,
	};
}

/** Vertical scroll geometry of an element, in unscaled layout pixels. */
export interface VerticalScrollGeometry {
	readonly scrollHeight: number;
	readonly clientHeight: number;
	/** Height the element's content box loses to a horizontal scrollbar, if any. */
	readonly horizontalScrollbarHeight: number;
}

/**
 * Whether an element has content that can actually be scrolled vertically.
 * A classic (space-consuming) horizontal scrollbar shrinks `clientHeight`
 * without adding scrollable content, so comparing `scrollHeight` against
 * `clientHeight` alone also reports elements that only overflow horizontally.
 */
export function scrollsContentVertically(geometry: VerticalScrollGeometry): boolean {
	const scrollbarHeight = Math.max(geometry.horizontalScrollbarHeight, 0);
	return geometry.scrollHeight - geometry.clientHeight > scrollbarHeight;
}

/**
 * Whether `element` is a `<body>` whose overflow is propagated to the viewport.
 * CSS propagates the root element's overflow to the viewport; when the root is
 * `visible`, the body's overflow is propagated instead. Such a body reports
 * scrollable geometry, but scrolling it does nothing — the window owns the
 * scrolling — so it must not be treated as an element-level scroller.
 */
export function hasViewportPropagatedOverflow(element: HTMLElement): boolean {
	const doc = element.ownerDocument;
	if (element !== doc.body) { return false; }
	const rootStyle = doc.defaultView?.getComputedStyle(doc.documentElement);
	return rootStyle !== undefined
		&& rootStyle.overflowX === 'visible'
		&& rootStyle.overflowY === 'visible';
}

/**
 * Applies {@link scrollsContentVertically} to a live element, excluding a body
 * that only appears scrollable because its overflow is propagated to the
 * viewport.
 */
export function elementScrollsContentVertically(element: HTMLElement): boolean {
	if (hasViewportPropagatedOverflow(element)) { return false; }
	const style = element.ownerDocument.defaultView?.getComputedStyle(element);
	const borderY = style
		? parseFloat(style.borderTopWidth) + parseFloat(style.borderBottomWidth)
		: 0;
	return scrollsContentVertically({
		scrollHeight: element.scrollHeight,
		clientHeight: element.clientHeight,
		horizontalScrollbarHeight: element.offsetHeight
			- element.clientHeight
			- (Number.isFinite(borderY) ? borderY : 0),
	});
}

export function getScrollableAncestors(element: Element): readonly HTMLElement[] {
	const doc = element.ownerDocument;
	const win = doc.defaultView ?? window;
	const result: HTMLElement[] = [];
	for (let parent = element.parentElement; parent; parent = parent.parentElement) {
		const style = win.getComputedStyle(parent);
		const scrollsX = scrollsOverflow(style.overflowX) && parent.scrollWidth > parent.clientWidth;
		const scrollsY = scrollsOverflow(style.overflowY) && parent.scrollHeight > parent.clientHeight;
		if (scrollsX || scrollsY) {
			result.push(parent);
		}
	}
	return result;
}

export function clientRectIntersects(a: Pick<Rect2D, 'left' | 'right' | 'top' | 'bottom'>, b: Pick<Rect2D, 'left' | 'right' | 'top' | 'bottom'>): boolean {
	return Math.max(a.left, b.left) < Math.min(a.right, b.right)
		&& Math.max(a.top, b.top) < Math.min(a.bottom, b.bottom);
}

export function clientRectContains(container: Pick<Rect2D, 'left' | 'right' | 'top' | 'bottom'>, value: Pick<Rect2D, 'left' | 'right' | 'top' | 'bottom'>): boolean {
	return container.left <= value.left
		&& value.right <= container.right
		&& container.top <= value.top
		&& value.bottom <= container.bottom;
}

function clipsOverflow(value: string): boolean {
	return value === 'auto' || value === 'scroll' || value === 'hidden' || value === 'clip';
}

function scrollsOverflow(value: string): boolean {
	return value === 'auto' || value === 'scroll' || value === 'hidden';
}
