import { Disposable, autorun, derived, type IObservable } from '@vscode/observables';
import { OffsetRange } from '../../core/offsetRange.js';
import type { GutterMarker, GutterMarkerType } from '../../core/gutterMarker.js';
import type { VisualLine, VisualLineMap } from '../visualLineMap.js';

export interface GutterMarkersViewOptions {
	readonly markers: IObservable<readonly GutterMarker[]>;
	readonly visualLineMap: IObservable<VisualLineMap>;
}

/**
 * One painted gutter element, in parent-local coordinates. A `'deleted'` marker
 * is zero-height (`height === 0`) and rendered as a wedge sitting at `y`; the
 * others are bars spanning `[y, y + height)`.
 */
export interface GutterMarkerRect {
	readonly type: GutterMarkerType;
	readonly y: number;
	readonly height: number;
}

/**
 * Owns the gutter overlay that paints source-control style change markers
 * (added / modified / deleted) in the editor's left gutter.
 *
 * Same shape as {@link CursorView}/{@link SelectionView}: a single `derived`
 * resolves each {@link GutterMarker}'s source range to the {@link VisualLine}s
 * it covers via the {@link VisualLineMap}, writes one absolutely-positioned
 * child element per marker, and returns a {@link GutterMarkersViewRendering} as
 * proof. An autorun keeps the derived subscribed.
 *
 * The view only sets vertical geometry (`top`/`height`) and a type class; the
 * gutter's horizontal placement, width and colors live in CSS so themes can
 * tune them. The layer is `pointer-events: none` like the other overlays.
 */
export class GutterMarkersView extends Disposable {
	readonly element: HTMLElement;
	readonly rendering: IObservable<GutterMarkersViewRendering>;

	constructor(options: GutterMarkersViewOptions) {
		super();
		this.element = document.createElement('div');
		this.element.className = 'md-gutter-layer';

		this.rendering = derived(this, reader => {
			const markers = reader.readObservable(options.markers);
			const visualLineMap = reader.readObservable(options.visualLineMap);
			return this._render(markers, visualLineMap);
		});

		this._register(autorun(reader => { reader.readObservable(this.rendering); }));
	}

	private _render(markers: readonly GutterMarker[], visualLineMap: VisualLineMap): GutterMarkersViewRendering {
		this.element.replaceChildren();
		if (visualLineMap.isEmpty) { return new GutterMarkersViewRendering([]); }

		const rects: GutterMarkerRect[] = [];

		for (const marker of markers) {
			const rect = marker.type === 'deleted' || marker.range.isEmpty
				? _deletedRect(marker, visualLineMap)
				: _barRect(marker, visualLineMap);
			if (!rect) { continue; }

			const el = document.createElement('div');
			el.className = `md-gutter-marker md-gutter-marker-${rect.type}`;
			el.style.top = `${rect.y}px`;
			if (rect.height > 0) { el.style.height = `${rect.height}px`; }
			this.element.appendChild(el);
			rects.push(rect);
		}

		return new GutterMarkersViewRendering(rects);
	}
}

export class GutterMarkersViewRendering {
	constructor(readonly rects: readonly GutterMarkerRect[]) { }
}

/**
 * Bar spanning every visual line the marker's range intersects: top of the
 * first such line to the bottom of the last. Returns `undefined` when the range
 * covers no rendered line.
 */
function _barRect(marker: GutterMarker, visualLineMap: VisualLineMap): GutterMarkerRect | undefined {
	let top = Infinity;
	let bottom = -Infinity;
	for (const line of visualLineMap.sourceLines) {
		const lineRange = _lineSourceRange(line);
		if (!lineRange || !marker.range.intersects(lineRange)) { continue; }
		top = Math.min(top, line.rect.top);
		bottom = Math.max(bottom, line.rect.top + line.rect.height);
	}
	if (bottom <= top) { return undefined; }
	return { type: marker.type, y: top, height: bottom - top };
}

/**
 * Wedge for a deletion: anchored at the top of the line that *starts* at the
 * deletion offset, so it points at the seam where the removed text used to be.
 */
function _deletedRect(marker: GutterMarker, visualLineMap: VisualLineMap): GutterMarkerRect {
	const lineIdx = visualLineMap.lineIndexOfOffset(marker.range.start);
	const lineRect = visualLineMap.lineRect(lineIdx);
	return { type: 'deleted', y: lineRect.top, height: 0 };
}

function _lineSourceRange(line: VisualLine): OffsetRange | undefined {
	if (line.runs.length === 0) { return undefined; }
	let min = Infinity;
	let max = -Infinity;
	for (const run of line.runs) {
		if (run.sourceStart < min) { min = run.sourceStart; }
		if (run.sourceEndExclusive > max) { max = run.sourceEndExclusive; }
	}
	return OffsetRange.fromTo(min, max);
}
