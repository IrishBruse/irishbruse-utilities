import { Disposable, autorun } from '@vscode/observables';
import type { IDisposable } from '@vscode/observables';
import { Rect2D } from '../../core/geometry.js';
import { OffsetRange } from '../../core/offsetRange.js';
import type { BlockMeasurement } from '../../model/measuredLayoutModel.js';
import type { DocumentViewNode } from '../../view/content/documentView.js';
import { mappedRangesForOffsets } from '../../view/diffHighlight.js';
import type { EditorView } from '../../view/editorView.js';
import { getClippingClientRect } from '../../view/scrolling.js';
import type { VisualRun } from '../../view/visualLineMap.js';
import type { FindModel, FindSearchResult } from './findModel.js';

const MAX_PAINTED_RECTS = 1_000;
const MATCH_HIGHLIGHT_NAME = 'md-editor-find-match';
const CURRENT_HIGHLIGHT_NAME = 'md-editor-find-current';

interface FindHighlightRegistration extends IDisposable {
	update(matches: readonly Range[], current: readonly Range[]): void;
}

interface FindHighlightEntry {
	matches: readonly Range[];
	current: readonly Range[];
}

const highlightRegistries = new WeakMap<Document, DocumentFindHighlightRegistry>();

class DocumentFindHighlightRegistry {
	private readonly _entries = new Set<FindHighlightEntry>();

	constructor(private readonly _registry: HighlightRegistry) {}

	add(): FindHighlightRegistration {
		const entry: FindHighlightEntry = { matches: [], current: [] };
		this._entries.add(entry);
		this._refresh();
		return {
			update: (matches, current) => {
				entry.matches = matches;
				entry.current = current;
				this._refresh();
			},
			dispose: () => {
				this._entries.delete(entry);
				this._refresh();
			},
		};
	}

	private _refresh(): void {
		const matches = [...this._entries].flatMap(entry => entry.matches);
		const current = [...this._entries].flatMap(entry => entry.current);
		this._set(MATCH_HIGHLIGHT_NAME, matches);
		this._set(CURRENT_HIGHLIGHT_NAME, current);
	}

	private _set(name: string, ranges: readonly Range[]): void {
		if (ranges.length === 0) {
			this._registry.delete(name);
		} else {
			this._registry.set(name, new Highlight(...ranges));
		}
	}
}

function registerFindHighlights(document: Document): FindHighlightRegistration {
	const registry = document.defaultView?.CSS.highlights;
	if (!registry) {
		return { update: () => {}, dispose: () => {} };
	}
	let manager = highlightRegistries.get(document);
	if (!manager) {
		manager = new DocumentFindHighlightRegistry(registry);
		highlightRegistries.set(document, manager);
	}
	return manager.add();
}

interface FindHighlightSnapshot {
	readonly isRevealed: boolean;
	readonly result: FindSearchResult;
	readonly currentMatch: OffsetRange | undefined;
	readonly document: DocumentViewNode | undefined;
	readonly measurements: readonly BlockMeasurement[];
}

export class FindHighlightsView extends Disposable {
	private readonly _matchesLayer: HTMLElement;
	private readonly _currentLayer: HTMLElement;
	private readonly _highlightRegistration: FindHighlightRegistration;
	private readonly _resizeObserver: ResizeObserver;
	private readonly _resizeObservedElements = new Set<Element>();
	private _snapshot: FindHighlightSnapshot | undefined;
	private _paintRaf = 0;

	constructor(
		private readonly _view: EditorView,
		findModel: FindModel,
	) {
		super();

		this._matchesLayer = createLayer('md-find-matches-layer');
		this._currentLayer = createLayer('md-find-current-layer');
		this._highlightRegistration = this._register(registerFindHighlights(this._view.element.ownerDocument));
		this._register(this._view.mountOverlay(this._matchesLayer, 'below-selection'));
		this._register(this._view.mountOverlay(this._currentLayer, 'above-decorations'));

		this._register(autorun(reader => {
			const isRevealed = findModel.isRevealed.read(reader);
			if (!isRevealed) {
				this._snapshot = undefined;
				this._schedulePaint();
				return;
			}
			this._snapshot = {
				isRevealed,
				result: findModel.searchResult.read(reader),
				currentMatch: findModel.currentMatch.read(reader),
				document: this._view.documentViewNode.read(reader),
				measurements: this._view.measuredLayout.measurements.read(reader),
			};
			this._schedulePaint();
		}));

		const onScroll = (): void => this._schedulePaint();
		const doc = this._view.element.ownerDocument;
		const win = doc.defaultView ?? window;
		doc.addEventListener('scroll', onScroll, true);
		win.addEventListener('scroll', onScroll);
		this._register({
			dispose: () => {
				doc.removeEventListener('scroll', onScroll, true);
				win.removeEventListener('scroll', onScroll);
			},
		});

		this._resizeObserver = new ResizeObserver(() => this._schedulePaint());
		this._observeResizeAncestors();
		win.addEventListener('resize', onScroll);
		this._register({
			dispose: () => {
				win.removeEventListener('resize', onScroll);
				this._resizeObserver.disconnect();
			},
		});
		this._register({
			dispose: () => {
				if (this._paintRaf) { cancelAnimationFrame(this._paintRaf); }
			},
		});
	}

	private _schedulePaint(): void {
		if (this._paintRaf) { return; }
		this._paintRaf = requestAnimationFrame(() => {
			this._paintRaf = 0;
			this._paint();
		});
	}

	private _paint(): void {
		this._observeResizeAncestors();
		const snapshot = this._snapshot;
		if (
			!snapshot
			|| !snapshot.isRevealed
			|| snapshot.result.kind === 'invalid'
			|| !snapshot.document
		) {
			this._matchesLayer.replaceChildren();
			this._currentLayer.replaceChildren();
			this._highlightRegistration.update([], []);
			return;
		}

		const transform = this._view.coordinateSpace.capture();
		const visibleClientRect = getClippingClientRect(this._view.overlayContainer);
		const visibleLocalRect = transform.toLocalRect(visibleClientRect);
		const visibleSourceRanges = mergeRanges(
			this._view.measuredLayout.visualLineMap.get().sourceLines.flatMap(line => {
				if (
					Math.max(line.rect.top, visibleLocalRect.top)
					>= Math.min(line.rect.bottom, visibleLocalRect.bottom)
				) {
					return [];
				}
				return line.runs.flatMap(run => {
					const visibleRange = visibleSourceRangeForRun(run, line.rect, visibleLocalRect);
					return visibleRange ? [visibleRange] : [];
				});
			}),
		);
		const visibleMatches = intersectWithVisibleRanges(
			snapshot.result.matches.filter(match => !snapshot.currentMatch?.equals(match)),
			visibleSourceRanges,
		);
		const visibleCurrentMatch = snapshot.currentMatch ? [snapshot.currentMatch] : [];
		const visibleCurrentRanges = intersectWithVisibleRanges(visibleCurrentMatch, visibleSourceRanges);

		const matchRanges = this._paintRanges(
			this._matchesLayer,
			snapshot.document,
			visibleMatches,
			snapshot.measurements,
			visibleLocalRect,
			'md-find-match-rect',
			MAX_PAINTED_RECTS,
		);
		const currentRanges = this._paintRanges(
			this._currentLayer,
			snapshot.document,
			visibleCurrentRanges,
			snapshot.measurements,
			visibleLocalRect,
			'md-find-current-rect',
			Number.POSITIVE_INFINITY,
		);
		this._highlightRegistration.update(matchRanges, currentRanges);
	}

	private _observeResizeAncestors(): void {
		for (let element: Element | null = this._view.element; element; element = element.parentElement) {
			if (this._resizeObservedElements.has(element)) { continue; }
			this._resizeObservedElements.add(element);
			this._resizeObserver.observe(element);
		}
	}

	private _paintRanges(
		layer: HTMLElement,
		documentNode: DocumentViewNode,
		sourceRanges: readonly OffsetRange[],
		measurements: readonly BlockMeasurement[],
		visibleLocalRect: Rect2D,
		className: string,
		limit: number,
	): readonly Range[] {
		const transform = this._view.coordinateSpace.capture();
		const fragment = document.createDocumentFragment();
		const domRanges: Range[] = [];
		let painted = 0;

		for (const sourceRange of sourceRanges.filter(range => range.isEmpty)) {
			const visualLineMap = this._view.measuredLayout.visualLineMap.get();
			if (visualLineMap.isEmpty) { continue; }
			const lineIndex = visualLineMap.lineIndexOfOffset(sourceRange.start);
			const lineRect = visualLineMap.lineRect(lineIndex);
			const localRect = clipRect(
				Rect2D.fromPointSize(
					visualLineMap.xAtOffset(sourceRange.start),
					lineRect.top,
					2,
					lineRect.height,
				),
				visibleLocalRect,
				measurementContaining(measurements, sourceRange.start)?.viewportClip,
			);
			if (!localRect) { continue; }
			fragment.appendChild(createHighlightRect(`${className} md-find-zero-width-rect`, localRect));
			painted++;
			if (painted >= limit) {
				layer.replaceChildren(fragment);
				return domRanges;
			}
		}

		const remainingRangeBudget = Number.isFinite(limit)
			? Math.max(0, limit - painted)
			: Number.POSITIVE_INFINITY;
		for (const mapped of mappedRangesForOffsets(
			documentNode,
			sourceRanges.filter(range => !range.isEmpty),
			remainingRangeBudget,
		)) {
			const measurement = measurementContaining(measurements, mapped.sourceRange.start);
			let isVisible = false;
			for (const clientRect of mapped.range.getClientRects()) {
				const localRect = clipRect(
					transform.toLocalRect(clientRect),
					visibleLocalRect,
					measurement?.viewportClip,
				);
				if (!localRect || localRect.width === 0 || localRect.height === 0) { continue; }
				isVisible = true;
				fragment.appendChild(createHighlightRect(className, localRect));
				painted++;
				if (painted >= limit) {
					if (isVisible) { domRanges.push(mapped.range); }
					layer.replaceChildren(fragment);
					return domRanges;
				}
			}
			if (isVisible) { domRanges.push(mapped.range); }
		}
		layer.replaceChildren(fragment);
		return domRanges;
	}
}

function createHighlightRect(className: string, rect: Rect2D): HTMLElement {
	const element = document.createElement('div');
	element.className = className;
	element.style.left = `${rect.left}px`;
	element.style.top = `${rect.top}px`;
	element.style.width = `${rect.width}px`;
	element.style.height = `${rect.height}px`;
	return element;
}

function createLayer(className: string): HTMLElement {
	const element = document.createElement('div');
	element.className = `md-find-highlight-layer ${className}`;
	element.setAttribute('aria-hidden', 'true');
	return element;
}

function intersectWithVisibleRanges(
	matches: readonly OffsetRange[],
	visibleRanges: readonly OffsetRange[],
): readonly OffsetRange[] {
	if (visibleRanges.length === 0) { return []; }
	const result: OffsetRange[] = [];
	let visibleIndex = 0;
	for (const match of matches) {
		if (match.isEmpty) {
			while (
				visibleIndex < visibleRanges.length
				&& visibleRanges[visibleIndex].endExclusive < match.start
			) {
				visibleIndex++;
			}
			const visible = visibleRanges[visibleIndex];
			if (visible && visible.start <= match.start && match.start <= visible.endExclusive) {
				result.push(match);
			}
			continue;
		}
		while (
			visibleIndex < visibleRanges.length
			&& visibleRanges[visibleIndex].endExclusive <= match.start
		) {
			visibleIndex++;
		}
		for (let index = visibleIndex; index < visibleRanges.length; index++) {
			const visible = visibleRanges[index];
			if (visible.start >= match.endExclusive) { break; }
			const intersection = visible.intersect(match);
			if (intersection && !intersection.isEmpty) {
				result.push(intersection);
			}
		}
	}
	return result;
}

function measurementContaining(
	measurements: readonly BlockMeasurement[],
	offset: number,
): BlockMeasurement | undefined {
	let low = 0;
	let high = measurements.length;
	while (low < high) {
		const middle = (low + high) >>> 1;
		const measurement = measurements[middle];
		if (offset < measurement.absoluteStart) {
			high = middle;
		} else if (offset >= measurement.absoluteStart + measurement.block.length) {
			low = middle + 1;
		} else {
			return measurement;
		}
	}
	return undefined;
}

function mergeRanges(ranges: readonly OffsetRange[]): readonly OffsetRange[] {
	const sorted = ranges
		.slice()
		.sort((a, b) => a.start - b.start || a.endExclusive - b.endExclusive);
	const result: OffsetRange[] = [];
	for (const range of sorted) {
		const previous = result[result.length - 1];
		if (previous?.intersectsOrTouches(range)) {
			result[result.length - 1] = previous.join(range);
		} else {
			result.push(range);
		}
	}
	return result;
}

function visibleSourceRangeForRun(run: VisualRun, lineRect: Rect2D, visibleRect: Rect2D): OffsetRange | undefined {
	if (run.sourceRange.isEmpty) {
		return visibleRect.left <= run.rect.left && run.rect.left <= visibleRect.right
			? run.sourceRange
			: undefined;
	}

	let start = run.sourceStart;
	const end = run.sourceEndExclusive;
	if (start >= end) { return undefined; }

	const endX = run.xAtOffset(end);
	const nextX = run.xAtOffset(start + 1);
	const ascending = endX >= nextX;
	const leadingRect = run.rect.width > 0 ? run.rect : lineRect;
	const startX = ascending ? leadingRect.left : leadingRect.right;
	const xAtOffset = (offset: number): number =>
		offset === start ? startX : run.xAtOffset(offset);
	const normalizeX = (x: number): number => ascending ? x : -x;
	const visibleStartX = normalizeX(ascending ? visibleRect.left : visibleRect.right);
	const visibleEndX = normalizeX(ascending ? visibleRect.right : visibleRect.left);
	if (
		normalizeX(endX) < visibleStartX
		|| normalizeX(startX) > visibleEndX
	) {
		return undefined;
	}

	const firstVisibleOffset = lowerBoundOffset(start, end, offset =>
		normalizeX(xAtOffset(offset)) >= visibleStartX
	);
	if (firstVisibleOffset > end) { return undefined; }
	const firstOffsetPastVisible = Math.min(end, lowerBoundOffset(firstVisibleOffset, end, offset =>
		normalizeX(xAtOffset(offset)) > visibleEndX
	));
	if (firstVisibleOffset >= firstOffsetPastVisible) { return undefined; }
	return new OffsetRange(firstVisibleOffset, firstOffsetPastVisible);
}

function lowerBoundOffset(start: number, end: number, predicate: (offset: number) => boolean): number {
	let low = start;
	let high = end + 1;
	while (low < high) {
		const middle = (low + high) >>> 1;
		if (middle <= end && predicate(middle)) {
			high = middle;
		} else {
			low = middle + 1;
		}
	}
	return low;
}

function clipRect(
	rect: Rect2D,
	visible: Rect2D,
	viewportClip: { readonly left: number; readonly right: number } | undefined,
): Rect2D | undefined {
	const left = Math.max(rect.left, visible.left, viewportClip?.left ?? Number.NEGATIVE_INFINITY);
	const right = Math.min(rect.right, visible.right, viewportClip?.right ?? Number.POSITIVE_INFINITY);
	const top = Math.max(rect.top, visible.top);
	const bottom = Math.min(rect.bottom, visible.bottom);
	return left < right && top < bottom
		? Rect2D.fromPointPoint(left, top, right, bottom)
		: undefined;
}
