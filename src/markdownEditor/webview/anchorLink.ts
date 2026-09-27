import {
	DocumentAstNode,
	GlueAstNode,
	HeadingAstNode,
	ImageAstNode,
	MarkerAstNode,
	TextAstNode,
	findNodeOffsetById,
	type AstNode,
	type EditorView,
	type ViewNode,
} from '@vscode/markdown-editor';
import {
	DEFAULT_VIEWPORT_HEIGHT_PX,
	setPinnedMountAstIds,
	setSuspendViewportRefresh,
	setViewportBox,
} from './viewportVirtualization';

/**
 * GitHub heading anchors drop punctuation and turn each space into a hyphen,
 * so `Calendar & Contacts` is `calendar--contacts` and
 * `Communication - Email` is `communication---email`.
 */
const HEADING_SLUG_DROPPED = /[^\p{L}\p{N} _-]+/gu;

const ANCHOR_TOP_INSET_PX = 16;
const ANCHOR_ALIGN_FRAMES = 12;
const ANCHOR_SETTLE_FRAMES = 3;

export type DocumentAnchor =
	| { readonly kind: 'top' }
	| {
		readonly kind: 'heading';
		readonly heading: HeadingAstNode;
		readonly pinId: number;
		readonly offset: number;
	};

let scrollGeneration = 0;

export function sameDocumentFragment(href: string): string | undefined {
	const trimmed = href.trim();
	if (/^[a-z][a-z0-9+.-]*:/i.test(trimmed)) {
		return undefined;
	}
	const hash = trimmed.indexOf('#');
	if (hash < 0) {
		return undefined;
	}
	const path = trimmed.slice(0, hash);
	if (path !== '' && path !== '.' && path !== './') {
		return undefined;
	}
	const raw = trimmed.slice(hash + 1);
	try {
		return decodeURIComponent(raw);
	} catch {
		return raw;
	}
}

export function documentAnchor(doc: DocumentAstNode, href: string): DocumentAnchor | undefined {
	const fragment = sameDocumentFragment(href);
	if (fragment === undefined) {
		return undefined;
	}
	if (fragment.length === 0) {
		return { kind: 'top' };
	}
	const heading = findHeadingByFragment(doc, fragment);
	if (!heading) {
		return undefined;
	}
	const offset = findNodeOffsetById(doc, heading);
	if (offset === undefined) {
		return undefined;
	}
	const pin = topLevelAtOffset(doc, offset) ?? heading;
	return { kind: 'heading', heading, pinId: pin.id, offset };
}

export function openDocumentAnchor(
	host: HTMLElement,
	view: EditorView,
	doc: DocumentAstNode,
	href: string,
): boolean {
	const anchor = documentAnchor(doc, href);
	if (!anchor) {
		return false;
	}
	const generation = ++scrollGeneration;
	if (anchor.kind === 'top') {
		setPinnedMountAstIds([]);
		setSuspendViewportRefresh(false);
		host.scrollTop = 0;
		return true;
	}
	scrollToHeading(host, view, anchor, generation);
	return true;
}

function findHeadingByFragment(doc: DocumentAstNode, fragment: string): HeadingAstNode | undefined {
	const wanted = fragment.toLowerCase();
	const slugger = new HeadingSlugger();
	for (const heading of collectHeadings(doc)) {
		if (slugger.slug(headingPlainText(heading)) === wanted) {
			return heading;
		}
	}
	return undefined;
}

function collectHeadings(node: AstNode, out: HeadingAstNode[] = []): HeadingAstNode[] {
	if (node instanceof HeadingAstNode) {
		out.push(node);
		return out;
	}
	for (const child of node.children) {
		collectHeadings(child, out);
	}
	return out;
}

function headingPlainText(heading: HeadingAstNode): string {
	const parts: string[] = [];
	appendVisibleText(heading, parts);
	return parts.join('');
}

function appendVisibleText(node: AstNode, parts: string[]): void {
	if (node instanceof ImageAstNode) {
		parts.push(node.alt);
		return;
	}
	if (node instanceof MarkerAstNode) {
		if (node.markerKind === 'content') {
			parts.push(node.content);
		}
		return;
	}
	if (node instanceof TextAstNode || node instanceof GlueAstNode) {
		parts.push(node.content);
		return;
	}
	for (const child of node.children) {
		appendVisibleText(child, parts);
	}
}

class HeadingSlugger {
	readonly #counts = new Map<string, number>();

	slug(value: string): string {
		const original = value.toLowerCase().replace(HEADING_SLUG_DROPPED, '').replace(/ /g, '-');
		let result = original;
		while (this.#counts.has(result)) {
			const next = (this.#counts.get(original) ?? 0) + 1;
			this.#counts.set(original, next);
			result = `${original}-${next}`;
		}
		this.#counts.set(result, 0);
		return result;
	}
}

function topLevelAtOffset(doc: DocumentAstNode, offset: number): AstNode | undefined {
	let cursor = 0;
	for (const child of doc.children) {
		const next = cursor + child.length;
		if (offset >= cursor && offset < next) {
			return child;
		}
		cursor = next;
	}
	return undefined;
}

function scrollToHeading(
	host: HTMLElement,
	view: EditorView,
	anchor: Extract<DocumentAnchor, { kind: 'heading' }>,
	generation: number,
): void {
	const abort = new AbortController();
	const release = (): void => {
		abort.abort();
		if (generation === scrollGeneration) {
			setPinnedMountAstIds([]);
			setSuspendViewportRefresh(false);
		}
	};
	const cancel = (): void => {
		if (generation !== scrollGeneration) {
			return;
		}
		scrollGeneration++;
		abort.abort();
		setPinnedMountAstIds([]);
		setSuspendViewportRefresh(false);
	};
	host.addEventListener('wheel', cancel, { capture: true, signal: abort.signal });
	host.addEventListener('pointerdown', cancel, { capture: true, signal: abort.signal });
	host.addEventListener('keydown', cancel, { capture: true, signal: abort.signal });

	setPinnedMountAstIds([anchor.pinId]);
	setSuspendViewportRefresh(true);
	refreshMountedRange(host, view);

	let frames = 0;
	const step = (): void => {
		if (generation !== scrollGeneration) {
			return;
		}
		const element = findMountedElement(view, anchor.heading.id);
		// Virtualized blocks above the target are measured as they mount, which
		// shifts the heading. Keep rebuilding while that happens, then correct
		// scroll without another rebuild so the last shift stays on screen.
		const rebuild = frames < ANCHOR_ALIGN_FRAMES - ANCHOR_SETTLE_FRAMES;
		let moved = !element;
		if (element) {
			const delta = element.getBoundingClientRect().top - host.getBoundingClientRect().top - ANCHOR_TOP_INSET_PX;
			if (Math.abs(delta) > 1) {
				const before = host.scrollTop;
				host.scrollTop = Math.max(0, before + delta);
				moved = Math.abs(host.scrollTop - before) > 1;
				if (moved && rebuild) {
					refreshMountedRange(host, view);
				}
			} else {
				moved = false;
			}
		}
		frames++;
		if (moved && frames < ANCHOR_ALIGN_FRAMES) {
			requestAnimationFrame(step);
			return;
		}
		release();
	};
	step();
}

function refreshMountedRange(host: HTMLElement, view: EditorView): void {
	setViewportBox({
		scrollTop: host.scrollTop,
		height: host.clientHeight || DEFAULT_VIEWPORT_HEIGHT_PX,
	});
	view.refreshEmbeddedCodeEditors();
}

function findMountedElement(view: EditorView, astId: number): HTMLElement | undefined {
	for (const measurement of view.measuredLayout.measurements.get()) {
		const found = findElement(measurement.viewNode, astId);
		if (found) {
			return found;
		}
	}
	return undefined;
}

function findElement(node: ViewNode | undefined, astId: number): HTMLElement | undefined {
	if (!node) {
		return undefined;
	}
	if (node.ast.id === astId && node.dom instanceof HTMLElement) {
		return node.dom;
	}
	for (const child of node.children) {
		const found = findElement(child, astId);
		if (found) {
			return found;
		}
	}
	return undefined;
}
