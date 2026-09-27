import { OffsetRange } from '../core/offsetRange.js';
import { CursorPosition, type VirtualCursorLine } from '../core/cursorPosition.js';
import { Point2D, Rect2D } from '../core/geometry.js';
import type { SourceOffset } from '../core/sourceOffset.js';
import { VideoAstNode } from '../parser/ast.js';
import type { ViewNode } from './content/viewNode.js';
import { EditorCoordinateSpace, type EditorCoordinateTransform } from './editorCoordinateSpace.js';

/**
 * Geometry of the rendered document, as a map from source offsets to 2D
 * positions and back. All geometry is expressed in the editor overlay's local
 * CSS-pixel coordinate space.
 *
 * Structure (top to bottom):
 *
 *     VisualLineMap   = ordered list of VisualLines
 *     VisualLine      = a horizontal band [rect.top, rect.bottom) split
 *                       into one or more VisualRuns
 *     VisualRun       = a contiguous source range painted at a rectangle
 *                       on the line
 *
 * Invariants:
 *   - `lines[i].rect.bottom <= lines[i+1].rect.top + ε`
 *   - For any offset `o` covered by some run on line `L`:
 *       `xAtOffset(o)` is inside that run's horizontal range
 *       `xAtOffset(o)` is inside `L.rect.left..L.rect.right`
 *
 * The "map" goes both ways:
 *   - SourceOffset → (line, x) via {@link lineIndexOfOffset} + {@link xAtOffset}
 *   - Point2D → SourceOffset       via {@link offsetAtPoint}
 *
 * Both directions are total but not bijective: many offsets at a line
 * boundary map to the same `x`, and large areas of the document
 * (padding, gaps) map onto the nearest offset on the nearest line.
 *
 * Rendering a caret rect from these primitives is a consumer concern:
 *
 *     const i = map.lineIndexOfOffset(o);
 *     const caretRect = map.lineRect(i).withZeroWidthAt(map.xAtOffset(o));
 */
export class VisualLineMap {
	static readonly EMPTY = new VisualLineMap([]);

	static measure(
		blockViews: readonly { readonly absoluteStart: number; readonly viewNode: ViewNode }[],
		coordinateSpace: EditorCoordinateSpace,
		transform: EditorCoordinateTransform = coordinateSpace.capture(),
	): VisualLineMap {
		return _measure(blockViews, coordinateSpace, transform);
	}

	/** Lines backed by source ranges, excluding source-less cursor lines. */
	readonly sourceLines: readonly VisualLine[];

	constructor(readonly lines: readonly VisualLine[]) {
		this.sourceLines = lines.filter(line => !line.virtualCursorLine);
	}

	get lineCount(): number { return this.lines.length; }
	get isEmpty(): boolean { return this.lines.length === 0; }

	lineRect(lineIndex: number): Rect2D {
		return this.lines[lineIndex].rect;
	}

	// ---- SourceOffset → ... -------------------------------------------

	/**
	 * Line whose runs cover the offset, or the nearest line by source
	 * distance if no run covers it.
	 *
	 * An offset that is only a run's *trailing* boundary (`offset ===
	 * endExclusive`) — most notably the source offset just past a
	 * line-breaking `\n`, which a zero-width run reports as its end on the line
	 * it terminates — belongs to the START of the NEXT line instead. Preferring
	 * the line that actually *starts* the offset makes the caret advance past a
	 * newline to the next line rather than collapsing onto the previous line's
	 * end (which would render two distinct offsets at the same caret position).
	 * The first such trailing-boundary line is remembered as a fallback for the
	 * document's very last offset, where no later line starts it.
	 */
	lineIndexOfOffset(offset: SourceOffset): number {
		let endBoundaryLine = -1;
		for (let i = 0; i < this.lines.length; i++) {
			if (this.lines[i].virtualCursorLine) { continue; }
			const membership = this.lines[i].offsetMembership(offset);
			if (membership === 'covers') { return i; }
			if (membership === 'end' && endBoundaryLine < 0) { endBoundaryLine = i; }
		}
		if (endBoundaryLine >= 0) { return endBoundaryLine; }

		let bestIdx = 0;
		let bestDist = Infinity;
		for (let i = 0; i < this.lines.length; i++) {
			if (this.lines[i].virtualCursorLine) { continue; }
			const dist = this.lines[i].sourceDistanceTo(offset);
			if (dist < bestDist) { bestDist = dist; bestIdx = i; }
		}
		return bestIdx;
	}

	/**
	 * x of the caret position before `offset`, on the line returned by
	 * {@link lineIndexOfOffset}. Returns `0` when the map is empty.
	 */
	xAtOffset(offset: SourceOffset): number {
		if (this.lines.length === 0) { return 0; }
		return this.lines[this.lineIndexOfOffset(offset)].xAtOffset(offset);
	}

	/**
	 * Line occupied by a source or virtual cursor position. A virtual position
	 * returns `undefined` until its corresponding DOM line has been measured.
	 */
	lineIndexOfPosition(position: CursorPosition): number | undefined {
		if (position.kind === 'source') {
			return this.lineIndexOfOffset(position.offset);
		}
		const index = this.lines.findIndex(line => line.virtualCursorLine === position.line);
		return index < 0 ? undefined : index;
	}

	xAtPosition(position: CursorPosition): number {
		if (position.kind === 'source') {
			return this.xAtOffset(position.offset);
		}
		const lineIndex = this.lineIndexOfPosition(position);
		return lineIndex === undefined ? 0 : this.lines[lineIndex].rect.left;
	}

	// ---- Point2D → ... -------------------------------------------------

	/**
	 * Line whose vertical band contains `y`, clamped to the first/last
	 * line when `y` is outside the document.
	 */
	lineIndexAtY(y: number): number {
		if (this.lines.length === 0) { return 0; }
		for (let i = 0; i < this.lines.length; i++) {
			if (this.lines[i].virtualCursorLine) { continue; }
			if (y < this.lines[i].rect.bottom) { return i; }
		}
		for (let i = this.lines.length - 1; i >= 0; i--) {
			if (!this.lines[i].virtualCursorLine) { return i; }
		}
		return 0;
	}

	/**
	 * Snap a 2D point to the nearest source offset. Uses `y` to pick a
	 * line, then `x` to pick an offset within it. Up/down navigation
	 * uses {@link offsetInLineAtX} directly to preserve desired column.
	 */
	offsetAtPoint(point: Point2D): SourceOffset {
		return this.offsetInLineAtX(this.lineIndexAtY(point.y), point.x);
	}

	/** Snap `x` to the nearest offset on a specific line. */
	offsetInLineAtX(lineIndex: number, x: number): SourceOffset {
		if (lineIndex < 0 || lineIndex >= this.lines.length) { return 0; }
		const virtualLine = this.lines[lineIndex].virtualCursorLine;
		if (virtualLine) { return virtualLine.sourceOffsetBefore; }
		return this.lines[lineIndex].offsetAtX(x);
	}

	positionInLineAtX(lineIndex: number, x: number): CursorPosition {
		if (lineIndex < 0 || lineIndex >= this.lines.length) {
			return CursorPosition.source(0);
		}
		const virtualLine = this.lines[lineIndex].virtualCursorLine;
		return virtualLine
			? CursorPosition.virtual(virtualLine)
			: CursorPosition.source(this.lines[lineIndex].offsetAtX(x));
	}

	lineStartOffset(lineIndex: number): SourceOffset | undefined {
		if (lineIndex < 0 || lineIndex >= this.lines.length) { return undefined; }
		const line = this.lines[lineIndex];
		if (line.virtualCursorLine) { return undefined; }
		return line.offsetAtX(line.rect.left);
	}

	lineEndOffset(lineIndex: number): SourceOffset | undefined {
		if (lineIndex < 0 || lineIndex >= this.lines.length) { return undefined; }
		const line = this.lines[lineIndex];
		if (line.virtualCursorLine) { return undefined; }
		return line.offsetAtX(line.rect.right);
	}
}

/**
 * One visual line of rendered text: a horizontal band
 * (`rect.top`..`rect.bottom`) split into one or more {@link VisualRun}s
 * arranged left-to-right.
 */
export class VisualLine {
	static virtual(cursorLine: VirtualCursorLine, rect: Rect2D): VisualLine {
		return new VisualLine(
			rect,
			[VisualRun.visualLineAnchor(cursorLine.sourceOffsetBefore, rect.withZeroWidthAt(rect.left))],
			cursorLine,
		);
	}

	constructor(
		readonly rect: Rect2D,
		readonly runs: readonly VisualRun[],
		readonly virtualCursorLine?: VirtualCursorLine,
	) { }

	containsOffset(offset: SourceOffset): boolean {
		for (const run of this.runs) {
			if (run.containsOffset(offset)) { return true; }
		}
		return false;
	}

	/**
	 * How `offset` relates to this line's runs:
	 *   - `'covers'`: a run starts at or strictly contains the offset
	 *     (`start <= offset < endExclusive`), or a zero-length visual-line
	 *     anchor sits at the offset — the caret belongs on this line.
	 *   - `'end'`: the offset is only some run's trailing boundary
	 *     (`offset === endExclusive`) with no run covering it — a line-break
	 *     boundary the caret should leave for the next line.
	 *   - `'none'`: no run touches the offset.
	 */
	offsetMembership(offset: SourceOffset): 'covers' | 'end' | 'none' {
		let end = false;
		for (const run of this.runs) {
			if (run.isVisualLineAnchor && offset === run.sourceStart) { return 'covers'; }
			if (offset >= run.sourceStart && offset < run.sourceEndExclusive) { return 'covers'; }
			if (offset === run.sourceEndExclusive) { end = true; }
		}
		return end ? 'end' : 'none';
	}

	/**
	 * Min `|offset - r|` over offsets `r` in any of this line's runs. Used
	 * to pick the nearest line when no run actually covers the offset.
	 */
	sourceDistanceTo(offset: SourceOffset): number {
		let best = Infinity;
		for (const run of this.runs) {
			const d = run.sourceDistanceTo(offset);
			if (d < best) { best = d; }
		}
		return best;
	}

	/**
	 * x of the caret position before `offset` on this line.
	 *
	 * The runs tile the source but are stored in paint order, not sorted by
	 * source offset (hidden-marker runs are appended last). So this scans all
	 * runs rather than assuming any ordering:
	 *
	 *  - A zero-source visual anchor owns its exact offset, so a marker-only line
	 *    wins over the preceding line's inclusive end boundary.
	 *  - Otherwise a run starting at `offset` owns that seam. This keeps an
	 *    out-of-flow prefix from placing the caret at its trailing edge when the
	 *    following body starts at a visually separate x.
	 *  - Otherwise, if some run *covers* `offset`, its own geometry places the
	 *    caret (exact glyph boundary for text runs). In the active,
	 *    markers-visible form every interior offset is covered, so this branch
	 *    keeps distinct offsets distinct.
	 *  - Otherwise `offset` sits in a gap — a hidden inline marker such as the
	 *    `**` of `**bold**`, or before/after the painted text. It snaps to the
	 *    seam between the source-nearest runs on either side: the right edge of
	 *    the closest run ending at/before `offset`, else the left edge of the
	 *    closest run starting at/after it. A hidden marker collapses to zero
	 *    width, so both edges coincide at the seam.
	 */
	xAtOffset(offset: SourceOffset): number {
		for (const run of this.runs) {
			if (run.isVisualLineAnchor && run.sourceStart === offset) { return run.rect.left; }
		}
		for (const run of this.runs) {
			if (run.sourceStart === offset) { return run.xAtOffset(offset); }
		}
		for (const run of this.runs) {
			if (run.containsOffset(offset)) { return run.xAtOffset(offset); }
		}
		let leftRight: number | undefined;
		let leftEnd = -Infinity;
		let rightLeft: number | undefined;
		let rightStart = Infinity;
		for (const run of this.runs) {
			if (run.sourceEndExclusive <= offset && run.sourceEndExclusive > leftEnd) {
				leftEnd = run.sourceEndExclusive;
				leftRight = run.rect.right;
			}
			if (run.sourceStart >= offset && run.sourceStart < rightStart) {
				rightStart = run.sourceStart;
				rightLeft = run.rect.left;
			}
		}
		if (leftRight !== undefined) { return leftRight; }
		if (rightLeft !== undefined) { return rightLeft; }
		return this.runs[0].rect.left;
	}

	/**
	 * Snap `x` to the nearest offset on this line. If `x` falls inside a
	 * run, the run resolves the offset (exact glyph boundary for text runs,
	 * nearer edge for source-less runs); otherwise it snaps to the closer
	 * edge of the nearest run.
	 */
	offsetAtX(x: number): SourceOffset {
		if (this.runs.length === 0) { return 0; }

		let bestRun = this.runs[0];
		let bestDist = Infinity;
		for (const run of this.runs) {
			if (run.rect.containsX(x) || x === run.rect.right) {
				return run.offsetAtX(x);
			}
			const dist = Math.min(Math.abs(x - run.rect.left), Math.abs(x - run.rect.right));
			if (dist < bestDist) { bestDist = dist; bestRun = run; }
		}
		const nearestRunEdgeX = Math.min(Math.max(x, bestRun.rect.left), bestRun.rect.right);
		return bestRun.offsetAtX(nearestRunEdgeX);
	}
}

/**
 * The DOM source of a {@link VisualRun}. When set, `xAtOffset` and
 * `offsetAtX` measure exact glyph positions via `Range.getBoundingClientRect`.
 * This matters for proportional fonts where character widths differ a lot
 * (e.g. `m` vs `i`): a caret placed by anything coarser than real glyph
 * measurement lands several pixels inside the wrong character.
 *
 * A run without a source has no per-offset geometry, so it maps between
 * offsets and x by snapping to the nearer run edge. Real text runs always
 * carry a source; source-less runs are element-only blocks (see
 * {@link _appendElementBlockRun}) and hand-built runs in tests.
 */
export interface VisualRunSource {
	readonly textNode: Text;
	/** Offset within `textNode.data` corresponding to `sourceRange.start`. */
	readonly textNodeStart: number;
	readonly coordinateSpace: EditorCoordinateSpace;
}

/**
 * One contiguous run of text painted on a single visual line.
 *
 * When constructed with a {@link VisualRunSource}, `xAtOffset` returns the
 * pixel-exact x of the caret before character `offset` by measuring the
 * prefix `[textNodeStart, textNodeStart + (offset - sourceStart))` with a
 * DOM `Range`.
 *
 * A source-less run has no per-offset geometry: it either represents an
 * element-only block (KaTeX math, a mermaid/custom diagram, an image, an
 * inactive `<hr>`) whose box does not correspond to source offsets, or a
 * hand-built run in a test. Either way it maps between offsets and x by
 * snapping to the nearer edge of {@link rect} rather than fabricating
 * interior positions.
 */
export class VisualRun {
	static visualLineAnchor(sourceOffset: SourceOffset, rect: Rect2D): VisualRun {
		return new VisualRun(OffsetRange.emptyAt(sourceOffset), rect, undefined, true);
	}

	constructor(
		readonly sourceRange: OffsetRange,
		readonly rect: Rect2D,
		readonly source?: VisualRunSource,
		readonly isVisualLineAnchor: boolean = false,
	) { }

	get sourceStart(): SourceOffset { return this.sourceRange.start; }
	get sourceEndExclusive(): SourceOffset { return this.sourceRange.endExclusive; }
	get sourceLength(): number { return this.sourceRange.length; }

	containsOffset(offset: SourceOffset): boolean {
		return offset >= this.sourceStart && offset <= this.sourceEndExclusive;
	}

	sourceDistanceTo(offset: SourceOffset): number {
		if (offset < this.sourceStart) { return this.sourceStart - offset; }
		if (offset > this.sourceEndExclusive) { return offset - this.sourceEndExclusive; }
		return 0;
	}

	xAtOffset(offset: SourceOffset): number {
		if (this.sourceLength === 0 || offset <= this.sourceStart) { return this.rect.left; }
		if (this.source) {
			return _xAtTextOffset(
				this.source.textNode,
				this.source.textNodeStart + (offset - this.sourceStart),
				this.rect.left,
				this.source.coordinateSpace,
			);
		}
		// No per-offset geometry: the caret sits at the run edge nearer to
		// `offset` (see class doc). Real text runs always carry a source, so
		// this only covers element blocks and hand-built test runs.
		const fraction = (offset - this.sourceStart) / this.sourceLength;
		return fraction <= 0.5 ? this.rect.left : this.rect.right;
	}

	offsetAtX(x: number): SourceOffset {
		if (this.rect.width <= 0) { return this.sourceStart; }
		if (this.source) {
			const localOffset = _offsetAtX(
				this.source.textNode,
				this.source.textNodeStart,
				this.source.textNodeStart + this.sourceLength,
				x,
				this.source.coordinateSpace,
			);
			return this.sourceStart + (localOffset - this.source.textNodeStart);
		}
		// No per-offset geometry: snap to the nearer edge rather than
		// fabricating interior positions (matching the element-edge rule in
		// `ViewNode.getLocalSourceRange`).
		const mid = (this.rect.left + this.rect.right) / 2;
		return x < mid ? this.sourceStart : this.sourceEndExclusive;
	}
}

/**
 * x position of the caret before character `textOffset` in `textNode`.
 * Uses the right edge of the preceding character (or the left edge of
 * the run if `textOffset` is at the run's start).
 */
function _xAtTextOffset(
	textNode: Text,
	textOffset: number,
	fallbackLeft: number,
	coordinateSpace: EditorCoordinateSpace,
): number {
	if (textOffset <= 0) { return fallbackLeft; }
	const range = document.createRange();
	range.setStart(textNode, textOffset - 1);
	range.setEnd(textNode, textOffset);
	const rect = range.getBoundingClientRect();
	if (rect.width === 0 && rect.height === 0) { return fallbackLeft; }
	return coordinateSpace.capture().toLocalRect(rect).right;
}

/**
 * Snap `x` to a character boundary in `textNode[start..end]` via binary
 * search on per-character rects. Returns an offset in `[start, end]`.
 */
function _offsetAtX(
	textNode: Text,
	start: number,
	end: number,
	x: number,
	coordinateSpace: EditorCoordinateSpace,
): number {
	const range = document.createRange();
	const transform = coordinateSpace.capture();
	let bestOffset = start;
	let bestDist = Infinity;
	for (let i = start; i < end; i++) {
		range.setStart(textNode, i);
		range.setEnd(textNode, i + 1);
		const clientRect = range.getBoundingClientRect();
		if (clientRect.width === 0 && clientRect.height === 0) { continue; }
		const rect = transform.toLocalRect(clientRect);
		const mid = (rect.left + rect.right) / 2;
		// Pick the edge of this character closest to x.
		const dLeft = Math.abs(x - rect.left);
		const dRight = Math.abs(x - rect.right);
		if (dLeft < bestDist) { bestDist = dLeft; bestOffset = i; }
		if (dRight < bestDist) { bestDist = dRight; bestOffset = i + 1; }
		// Early-exit: if x is inside this char, pick the closer edge.
		if (x >= rect.left && x <= rect.right) {
			return x < mid ? i : i + 1;
		}
	}
	return bestOffset;
}

// ---------- measurement ------------------------------------------------

/**
 * Walk a DOM Text leaf and return rects in editor-local CSS pixels,
 * expanded vertically to the parent element's line-height so caret height
 * matches the visual line box (with leading), not just the glyph height.
 */
function _measure(
	blockViews: readonly { readonly absoluteStart: number; readonly viewNode: ViewNode }[],
	coordinateSpace: EditorCoordinateSpace,
	transform: EditorCoordinateTransform,
): VisualLineMap {
	const rawRuns: VisualRun[] = [];

	for (const view of blockViews) {
		const runsBefore = rawRuns.length;
		view.viewNode.forEachTextLeaf(view.absoluteStart, (leaf, leafOffset) => {
			const textNode = leaf.dom as Text;
			if (textNode.length === 0) { return; }

			const range = document.createRange();
			range.selectNodeContents(textNode);
			const clientRects = range.getClientRects();
			if (clientRects.length === 0) { return; }
			const rects = _mergeSameLineRects(Array.from(clientRects, rect => transform.toLocalRect(rect)));

			const lineBoxHeight = _lineBoxHeight(textNode.parentElement);
			if (leaf.sourceLength === 0) {
				rawRuns.push(VisualRun.visualLineAnchor(
					leafOffset,
					_expandToLineBox(rects[0], lineBoxHeight),
				));
				return;
			}

			if (rects.length === 1) {
				rawRuns.push(new VisualRun(
					OffsetRange.fromTo(leafOffset, leafOffset + textNode.length),
					_expandToLineBox(rects[0], lineBoxHeight),
					{ textNode, textNodeStart: 0, coordinateSpace },
				));
			} else {
				const breakOffsets = _findLineBreakOffsets(textNode, rects, transform);
				for (let i = 0; i < rects.length; i++) {
					const start = i === 0 ? 0 : breakOffsets[i - 1];
					const end = i < breakOffsets.length ? breakOffsets[i] : textNode.length;
					rawRuns.push(new VisualRun(
						OffsetRange.fromTo(leafOffset + start, leafOffset + end),
						_expandToLineBox(rects[i], lineBoxHeight),
						{ textNode, textNodeStart: start, coordinateSpace },
					));
				}
			}
		});
		_appendRenderedVideoRuns(rawRuns, view.viewNode, view.absoluteStart, transform);
		if (rawRuns.length === runsBefore) {
			_appendElementBlockRun(rawRuns, view.viewNode, view.absoluteStart, transform);
		}
	}

	rawRuns.sort((a, b) => a.rect.y - b.rect.y || a.rect.x - b.rect.x);

	const lines: VisualLine[] = [];
	let currentRuns: VisualRun[] = [];
	let currentY = -Infinity;
	let currentHeight = 0;
	let currentLeft = Infinity;
	let currentRight = -Infinity;

	const flush = (): void => {
		if (currentRuns.length === 0) { return; }
		lines.push(new VisualLine(
			Rect2D.fromPointPoint(currentLeft, currentY, currentRight, currentY + currentHeight),
			currentRuns,
		));
	};

	for (const run of rawRuns) {
		const r = run.rect;
		// A run joins the current line only if it overlaps the current line band
		// by more than half the (smaller) height. Comparing against the current
		// bottom alone fails when glyph rects are taller than the line advance
		// (e.g. wrapped headings whose 43px rects advance only 40px), which would
		// otherwise collapse every wrapped line into one.
		const sameLine = currentRuns.length > 0 && _rectsShareVisualLine(
			Rect2D.fromPointSize(currentLeft, currentY, currentRight - currentLeft, currentHeight),
			r,
		);
		if (!sameLine) {
			flush();
			currentRuns = [run];
			currentY = r.y;
			currentHeight = r.height;
			currentLeft = r.left;
			currentRight = r.right;
		} else {
			currentRuns.push(run);
			currentHeight = Math.max(currentHeight, r.y + r.height - currentY);
			currentLeft = Math.min(currentLeft, r.left);
			currentRight = Math.max(currentRight, r.right);
		}
	}
	flush();

	return new VisualLineMap(lines);
}

function _appendRenderedVideoRuns(
	rawRuns: VisualRun[],
	viewNode: ViewNode,
	absoluteStart: number,
	transform: EditorCoordinateTransform,
): void {
	if (viewNode.ast instanceof VideoAstNode && viewNode.children.length === 0 && viewNode.dom instanceof Element) {
		const source = viewNode.ast.source;
		if (!source) { return; }
		const clientRect = viewNode.dom.getBoundingClientRect();
		if (clientRect.width === 0 && clientRect.height === 0) { return; }
		const rect = transform.toLocalRect(clientRect);
		const sourceStart = absoluteStart + (viewNode.ast.leadingTrivia?.length ?? 0);
		rawRuns.push(new VisualRun(
			OffsetRange.ofStartAndLength(sourceStart, source.length),
			Rect2D.fromPointSize(rect.x, rect.y, rect.width, rect.height),
		));
		return;
	}

	let childOffset = absoluteStart;
	for (const child of viewNode.children) {
		_appendRenderedVideoRuns(rawRuns, child, childOffset, transform);
		childOffset += child.sourceLength;
	}
}

/**
 * A DOM range may report multiple fragments on one visual line, most notably
 * the visible text and a zero-width trailing newline. Source splitting needs
 * one rectangle per line; treating each fragment as a line produces empty
 * source runs whose geometry belongs to the visible text.
 */
function _mergeSameLineRects(rects: readonly Rect2D[]): Rect2D[] {
	const merged: Rect2D[] = [];
	for (const rect of rects) {
		const previous = merged[merged.length - 1];
		if (!previous || !_rectsShareVisualLine(previous, rect)) {
			merged.push(rect);
			continue;
		}
		merged[merged.length - 1] = Rect2D.fromPointPoint(
			Math.min(previous.left, rect.left),
			Math.min(previous.top, rect.top),
			Math.max(previous.right, rect.right),
			Math.max(previous.bottom, rect.bottom),
		);
	}
	return merged;
}

function _rectsShareVisualLine(a: Rect2D, b: Rect2D): boolean {
	const overlap = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top);
	return overlap > Math.min(a.height, b.height) / 2;
}

function _findLineBreakOffsets(
	textNode: Text,
	rects: readonly Rect2D[],
	transform: EditorCoordinateTransform,
): number[] {
	const breaks: number[] = [];
	const range = document.createRange();

	for (let r = 0; r < rects.length - 1; r++) {
		const nextY = rects[r + 1].y;
		let lo = r === 0 ? 0 : breaks[r - 1];
		let hi = textNode.length;

		while (lo < hi) {
			const mid = (lo + hi) >>> 1;
			range.setStart(textNode, mid);
			range.setEnd(textNode, Math.min(mid + 1, textNode.length));
			const charRect = transform.toLocalRect(range.getBoundingClientRect());
			if (charRect.y < nextY - 1) {
				lo = mid + 1;
			} else {
				hi = mid;
			}
		}
		breaks.push(lo);
	}

	return breaks;
}

function _lineBoxHeight(element: Element | null): number {
	if (!element) { return 0; }
	const cs = getComputedStyle(element);
	let lineHeight = parseFloat(cs.lineHeight);
	if (!isFinite(lineHeight)) {
		// `normal` — approximate as 1.2 * font-size, matching browser defaults.
		lineHeight = parseFloat(cs.fontSize) * 1.2;
	}
	return lineHeight;
}

function _expandToLineBox(rect: Rect2D, lineBoxHeight: number): Rect2D {
	if (lineBoxHeight <= rect.height) {
		return Rect2D.fromPointSize(rect.x, rect.y, rect.width, rect.height);
	}
	const leading = (lineBoxHeight - rect.height) / 2;
	return Rect2D.fromPointSize(rect.x, rect.y - leading, rect.width, lineBoxHeight);
}

/**
 * A block that renders as a non-text element (an inactive `<hr>` thematic
 * break, a KaTeX math block, a standalone image) yields no text leaf, so it
 * would contribute no {@link VisualLine}. Without one, the next block's lines
 * shift up and stepping the caret off such a block onto the following block
 * does not advance its line index — two distinct source offsets render at the
 * same caret position. Give the block one run spanning its whole source range
 * at the element's box so it occupies a line like any text block, keeping line
 * indices stable across its active (text) ↔ inactive (element) renderings. The
 * run has no source (no per-offset geometry), so a hit on it snaps to the
 * nearer edge rather than fabricating positions inside its interior source.
 */
function _appendElementBlockRun(
	rawRuns: VisualRun[],
	viewNode: ViewNode,
	absoluteStart: number,
	transform: EditorCoordinateTransform,
): void {
	const dom = viewNode.dom;
	if (dom.nodeType !== 1 /* ELEMENT_NODE */) { return; }
	const clientRect = (dom as Element).getBoundingClientRect();
	if (clientRect.width === 0 && clientRect.height === 0) { return; }
	const rect = transform.toLocalRect(clientRect);
	rawRuns.push(new VisualRun(
		OffsetRange.fromTo(absoluteStart, absoluteStart + viewNode.sourceLength),
		Rect2D.fromPointSize(rect.x, rect.y, rect.width, rect.height),
	));
}
