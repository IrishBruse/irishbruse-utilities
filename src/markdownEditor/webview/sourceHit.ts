export function textOffsetWithin(root: Node, node: Node, offset: number): number {
	if (node === root) {
		return offsetAt(node, offset);
	}
	let count = 0;
	const visit = (current: Node): boolean => {
		if (current === node) {
			count += offsetAt(current, offset);
			return true;
		}
		if (current.nodeType === 3) {
			count += current.textContent?.length ?? 0;
			return false;
		}
		for (const child of current.childNodes) {
			if (visit(child)) {
				return true;
			}
		}
		return false;
	};
	visit(root);
	return count;
}

function offsetAt(node: Node, offset: number): number {
	if (node.nodeType === 3) {
		return Math.max(0, Math.min(node.textContent?.length ?? 0, offset));
	}
	let count = 0;
	const limit = Math.min(offset, node.childNodes.length);
	for (let i = 0; i < limit; i++) {
		count += node.childNodes[i]?.textContent?.length ?? 0;
	}
	return count;
}

function sourceOffsetAttr(node: Node): number | undefined {
	if (!('dataset' in node)) {
		return undefined;
	}
	const value = (node as HTMLElement).dataset.sourceOffset;
	if (value === undefined) {
		return undefined;
	}
	const start = Number(value);
	return Number.isFinite(start) ? start : undefined;
}

function closestSourceMark(node: Node): Node | undefined {
	let current: Node | null = node;
	while (current) {
		if (sourceOffsetAttr(current) !== undefined) {
			return current;
		}
		current = (current as { parentElement?: Node | null }).parentElement ?? null;
	}
	return undefined;
}

export function resolveSourceOffset(node: Node, offset: number): number | undefined {
	const marked = closestSourceMark(node);
	if (!marked) {
		return undefined;
	}
	const start = sourceOffsetAttr(marked);
	if (start === undefined) {
		return undefined;
	}
	return start + textOffsetWithin(marked, node, offset);
}

export function locateDisplayedInSource(source: string, displayed: string, from: number): number {
	if (displayed.length === 0) {
		return from;
	}
	const at = source.indexOf(displayed, from);
	return at === -1 ? from : at;
}

function skipHitMarkText(text: Text): boolean {
	return !!text.parentElement?.closest('.md-math, .md-code-pre, .md-unhandled-scroll, script, style');
}

export function stampHitMarks(root: HTMLElement, absoluteStart: number, source?: string): void {
	const texts: Text[] = [];
	const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
	let node: Node | null;
	while ((node = walker.nextNode())) {
		if (node instanceof Text && (node.textContent?.length ?? 0) > 0 && !skipHitMarkText(node)) {
			texts.push(node);
		}
	}
	let searchFrom = 0;
	for (const text of texts) {
		const value = text.textContent ?? '';
		const parent = text.parentElement;
		const local = source === undefined
			? searchFrom
			: locateDisplayedInSource(source, value, searchFrom);
		searchFrom = local + value.length;
		if (parent?.dataset.sourceOffset !== undefined) {
			continue;
		}
		const span = document.createElement('span');
		span.className = 'md-hit';
		span.dataset.sourceOffset = String(absoluteStart + local);
		text.parentNode?.insertBefore(span, text);
		span.append(text);
	}
}

function caretIndexInMark(el: HTMLElement, clientX: number, clientY: number): number {
	const textNode = firstTextNode(el);
	const text = textNode?.textContent ?? el.textContent ?? '';
	if (!textNode || text.length === 0) {
		return 0;
	}
	let best = 0;
	let bestDist = Infinity;
	for (let i = 0; i <= text.length; i++) {
		const range = document.createRange();
		range.setStart(textNode, i);
		range.collapse(true);
		const rect = range.getBoundingClientRect();
		if (rect.width === 0 && rect.height === 0 && rect.top === 0 && rect.left === 0 && i < text.length) {
			continue;
		}
		const dx = clientX - rect.left;
		const dy = clientY - (rect.top + rect.height / 2);
		const dist = dx * dx + dy * dy;
		if (dist < bestDist) {
			bestDist = dist;
			best = i;
		}
	}
	return best;
}

function firstTextNode(root: Node): Text | undefined {
	if (root instanceof Text) {
		return root;
	}
	for (const child of root.childNodes) {
		const found = firstTextNode(child);
		if (found) {
			return found;
		}
	}
	return undefined;
}

export function nearestMarkedSourceOffset(root: HTMLElement, clientX: number, clientY: number): number | undefined {
	let best: { dist: number; node: HTMLElement } | undefined;
	for (const node of root.querySelectorAll('[data-source-offset]')) {
		if (!(node instanceof HTMLElement)) {
			continue;
		}
		if (sourceOffsetAttr(node) === undefined) {
			continue;
		}
		for (const rect of node.getClientRects()) {
			if (rect.width === 0 && rect.height === 0) {
				continue;
			}
			const dy = clientY < rect.top ? rect.top - clientY : clientY > rect.bottom ? clientY - rect.bottom : 0;
			if (dy > 14) {
				continue;
			}
			const dx = clientX < rect.left ? rect.left - clientX : clientX > rect.right ? clientX - rect.right : 0;
			const dist = dx * dx + dy * dy;
			if (!best || dist < best.dist) {
				best = { dist, node };
			}
		}
	}
	if (!best || best.dist > 48 * 48) {
		return undefined;
	}
	const start = sourceOffsetAttr(best.node);
	if (start === undefined) {
		return undefined;
	}
	return start + caretIndexInMark(best.node, clientX, clientY);
}

export function caretOffsetFromPoint(root: HTMLElement, clientX: number, clientY: number): number | undefined {
	const marked = nearestMarkedSourceOffset(root, clientX, clientY);
	if (marked !== undefined) {
		return marked;
	}
	const withPosition = document as Document & {
		caretPositionFromPoint?(x: number, y: number): { offsetNode: Node; offset: number } | null;
	};
	const position = withPosition.caretPositionFromPoint?.(clientX, clientY);
	if (position) {
		if (!root.contains(position.offsetNode) && position.offsetNode !== root) {
			return undefined;
		}
		return resolveSourceOffset(position.offsetNode, position.offset);
	}
	const range = document.caretRangeFromPoint?.(clientX, clientY);
	if (!range) {
		return undefined;
	}
	if (!root.contains(range.startContainer) && range.startContainer !== root) {
		return undefined;
	}
	return resolveSourceOffset(range.startContainer, range.startOffset);
}
