import { Point2D } from '../../core/geometry.js';

/**
 * A DOM node paired with a caret offset inside it. The node is an arbitrary
 * {@link globalThis.Node} (a Text node for a caret inside text, an Element for
 * a hit on element-only content), and `offset` is the caret offset within it.
 */
export interface DomPosition {
    readonly node: globalThis.Node;
    readonly offset: number;
}

/**
 * Client-coordinate point → the DOM caret position under it, using the
 * platform hit-test API (`caretPositionFromPoint`, with a `caretRangeFromPoint`
 * fallback). Returns `undefined` when the point hits nothing.
 */
export function caretDomPositionFromPoint(point: Point2D): DomPosition | undefined {
    const api = document as Document & {
        caretPositionFromPoint?: (x: number, y: number) => { offsetNode: globalThis.Node; offset: number } | null;
        caretRangeFromPoint?: (x: number, y: number) => Range | null;
    };
    if (api.caretPositionFromPoint) {
        const result = api.caretPositionFromPoint(point.x, point.y);
        return result ? { node: result.offsetNode, offset: result.offset } : undefined;
    }
    const range = api.caretRangeFromPoint?.(point.x, point.y);
    if (!range) { return undefined; }
    return { node: range.startContainer, offset: range.startOffset };
}

export function patchDomNodes(parent: globalThis.Node, nodes: readonly globalThis.Node[]): void {
	const activeElement = parent.ownerDocument?.activeElement;
	const restoreFocus = activeElement instanceof HTMLElement
		&& nodes.some(node => node === activeElement || (node instanceof Element && node.contains(activeElement)));
	let domCursor: ChildNode | null = parent.firstChild;
	let i = 0;
	for (; i < nodes.length; i++) {
		if (domCursor !== nodes[i]) { break; }
		domCursor = domCursor!.nextSibling;
	}
	if (i === nodes.length && domCursor === null) {
		return;
	}
	for (; i < nodes.length; i++) {
		const node = nodes[i];
		if (domCursor === node) {
			domCursor = node.nextSibling;
		} else {
			parent.insertBefore(node, domCursor);
		}
	}
	while (domCursor) {
		const toRemove = domCursor;
		domCursor = domCursor.nextSibling;
		parent.removeChild(toRemove);
	}
	if (restoreFocus && activeElement.isConnected && activeElement.ownerDocument.activeElement !== activeElement) {
		activeElement.focus({ preventScroll: true });
	}
}
