import { Disposable, autorun, derived, type IObservable } from '@vscode/observables';
import { Rect2D } from '../../core/geometry.js';
import { OffsetRange } from '../../core/offsetRange.js';
import type { Selection } from '../../core/selection.js';
import type { BlockAstNode } from '../../parser/ast.js';
import type { VisualLine, VisualLineMap, VisualRun } from '../visualLineMap.js';

/**
 * One mounted block, as far as selection painting is concerned. The view
 * supplies its block cache in this shape so the selection layer never has
 * to reach back into private view state.
 */
export interface SelectionBlock {
    readonly block: BlockAstNode;
    readonly absoluteStart: number;
    /** Block border box in editor-local coordinates. */
    readonly rect: Rect2D;
    /** Visible horizontal padding-box bounds for a scrolling block. */
    readonly viewportClip: { readonly left: number; readonly right: number } | undefined;
}

export interface SelectionViewOptions {
    readonly selection: IObservable<Selection | undefined>;
    readonly visualLineMap: IObservable<VisualLineMap>;
    readonly blocks: IObservable<readonly SelectionBlock[]>;
}

export interface SelectionRect {
    readonly x: number;
    readonly y: number;
    readonly width: number;
    readonly height: number;
}

/**
 * Owns the SVG overlay that paints the selection.
 *
 * Rendering is *line-based*, not glyph-based:
 *
 *  1. Each {@link VisualLine} overlapping the selection produces one rect
 *     using the full line-box height (so the selection has even, line-
 *     height bands instead of jagged glyph rects).
 *  2. Inter-block gaps fully inside the selection become connector rects.
 *  3. All rects are grouped into vertically-adjacent clusters and each
 *     cluster is rendered as a single connected polygon with rounded
 *     corners.
 *
 * To keep the polygon connected without gaps, "middle" lines (any line
 * that is neither the first nor the last selected line in the document)
 * are extended to their full line extent, while the first and last lines
 * are clipped to the actual selection start/end. This is the standard
 * envelope shape used by IDE selection rendering.
 */
export class SelectionView extends Disposable {
    readonly element: SVGSVGElement;
    readonly rendering: IObservable<SelectionViewRendering>;

    private readonly _path: SVGPathElement;

    constructor(
        options: SelectionViewOptions,
    ) {
        super();
        this.element = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
        this.element.setAttribute('class', 'md-selection-layer');
        this._path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
        this._path.setAttribute('class', 'md-selection-path');
        this.element.appendChild(this._path);

        this.rendering = derived(this, reader => {
            const selection = reader.readObservable(options.selection);
            const visualLineMap = reader.readObservable(options.visualLineMap);
            const blocks = reader.readObservable(options.blocks);
            return _renderSelection(this._path, selection, visualLineMap, blocks);
        });

        this._register(autorun(reader => { reader.readObservable(this.rendering); }));
    }
}

export class SelectionViewRendering {
    constructor(readonly rects: readonly SelectionRect[]) { }
}

function _renderSelection(
    path: SVGPathElement,
    selection: Selection | undefined,
    visualLineMap: VisualLineMap,
    blocks: readonly SelectionBlock[],
): SelectionViewRendering {
    if (!selection || selection.isCollapsed) {
        path.setAttribute('d', '');
        return new SelectionViewRendering([]);
    }
    const rects = computeRangeRects(selection.range, visualLineMap, blocks);
    path.setAttribute('d', buildConnectedPath(rects, 4));
    return new SelectionViewRendering(rects);
}

/**
 * Width of the trailing space painted at the end of a line whose hard line
 * break is selected, as a fraction of the line height. This mirrors how
 * editors show a selected newline: a small blank gap past the last glyph
 * (here just a space, no ↵ glyph) rather than nothing or a full-line band.
 */
const NEWLINE_SELECTION_WIDTH_RATIO = 0.4;

/**
 * Compute the selection-style rectangles covering `range`, in `parent`-local
 * coordinates. Shared by the live selection layer and the comments overlay so
 * both paint identical geometry from the same source of truth. Returns an empty
 * array for an empty range.
 */
export function computeRangeRects(
    range: OffsetRange,
    visualLineMap: VisualLineMap,
    blocks: readonly SelectionBlock[],
): SelectionRect[] {
    if (range.isEmpty) {
        return [];
    }
    const selRange = range;
    const toRect = (left: number, top: number, right: number, bottom: number): SelectionRect =>
        Rect2D.fromPointPoint(left, top, Math.max(left, right), Math.max(top, bottom));

    // 1. Collect the visual lines the selection touches, paired with the
    //    block that contains them. A line is touched when either:
    //      - the selection overlaps its rendered content, or
    //      - the selection covers the line's trailing *hard* line break —
    //        it starts at/after the line's content end but extends onto a
    //        later line. This second case is what lets a selection that
    //        runs off the end of a line paint a small trailing space at
    //        that line's end (the way editors render a selected newline),
    //        even though no glyph there is itself selected.
    const lines = visualLineMap.sourceLines;
    const lineInfos: { line: VisualLine; lineRange: OffsetRange; block: SelectionBlock | undefined; hardBreak: boolean }[] = [];
    for (let k = 0; k < lines.length; k++) {
        const line = lines[k];
        const lineRange = _lineSourceRange(line);
        if (!lineRange) { continue; }
        // The break after this line is "hard" (a real `\n`, or the document
        // end) when the next visual line starts past this line's content
        // end. A soft wrap has the next line starting exactly at this line's
        // content end, so it is not hard and gets no trailing space.
        const nextRange = k + 1 < lines.length ? _lineSourceRange(lines[k + 1]) : undefined;
        const hardBreak = !nextRange || nextRange.start > lineRange.endExclusive;
        const overlapsContent = selRange.intersects(lineRange);
        const selectsTrailingBreak = hardBreak
            && selRange.start <= lineRange.endExclusive
            && selRange.endExclusive > lineRange.endExclusive;
        if (!overlapsContent && !selectsTrailingBreak) { continue; }
        const block = blocks.find(b => OffsetRange.ofStartAndLength(b.absoluteStart, b.block.length).containsRange(lineRange));
        lineInfos.push({ line, lineRange, block, hardBreak });
    }

    const rects: SelectionRect[] = [];
    // Per-line rect in editor-local coordinates. Saved so the connector logic
    // can clip itself to the overlap of the bordering line rects.
    const lineRects: { left: number; right: number; top: number; bottom: number }[] = [];

    // One rect per visual line, full line-height. `startX` is clipped to
    // the selection start when it falls on this line, otherwise the line's
    // left edge. `endX` is clipped to the selection end when it falls on
    // this line; when the selection continues onto a later line, `endX`
    // runs to the painted text's right edge — plus a small fixed space
    // when the following break is a hard newline, so a selection that
    // spills off the end of a line shows a trailing gap there.
    for (const { line, lineRange, hardBreak, block } of lineInfos) {
        const cStart = lineRange.start;
        const cEnd = lineRange.endExclusive;

        let startX = selRange.start <= cStart
            ? line.rect.left
            : line.xAtOffset(selRange.start);

        let endX: number;
        if (selRange.endExclusive < cEnd) {
            endX = line.xAtOffset(selRange.endExclusive);
        } else {
            const breakSelected = selRange.endExclusive > cEnd;
            endX = line.rect.right + (breakSelected && hardBreak ? line.rect.height * NEWLINE_SELECTION_WIDTH_RATIO : 0);
        }

        // Empty-line `↵` icons are not part of a selection. Clip the band so it
        // stops at the text and starts again after the icons.
        for (const run of line.runs) {
            if (!_isEmptyLineIconRun(run)) { continue; }
            if (selRange.endExclusive <= run.sourceStart || selRange.start >= run.sourceEndExclusive) { continue; }
            if (selRange.start <= run.sourceStart) {
                endX = Math.min(endX, run.rect.left);
            } else {
                startX = Math.max(startX, run.rect.right);
            }
        }

        // A block that scrolls horizontally (code / math / unhandled) clips its
        // content to its own viewport, but the selection layer is one overlay
        // spanning the whole editor and is not clipped — so a rect for a wide
        // line would bleed across the page. Clip each line's rect to its block's
        // visible horizontal bounds; a line scrolled fully out collapses to zero
        // width (invisible, and its connector is dropped below).
        const clip = blockViewportClip(block);
        if (clip) {
            startX = Math.max(startX, clip.left);
            endX = Math.min(endX, clip.right);
        }

        if (endX > startX) {
            rects.push(toRect(startX, line.rect.top, endX, line.rect.bottom));
        }
        lineRects.push({
            left: Math.min(startX, endX),
            right: Math.max(startX, endX),
            top: line.rect.top,
            bottom: line.rect.top + line.rect.height,
        });
    }

    // 2a. Intra-line-pair connectors: between every consecutive pair of
    // selected lines (same block or not), if there's a vertical gap and
    // the lines share x, fill the gap clipped to that overlap. This
    // matters for blocks like <pre> where `line-height` leaves a few
    // pixels between consecutive lines that the polygon would otherwise
    // not bridge.
    for (let i = 0; i < lineRects.length - 1; i++) {
        const prev = lineRects[i];
        const next = lineRects[i + 1];
        if (next.top <= prev.bottom) { continue; }
        const left = Math.max(prev.left, next.left);
        const right = Math.min(prev.right, next.right);
        if (right <= left) { continue; }
        rects.push(toRect(left, prev.bottom, right, next.top));
    }

    // 2. Connectors that bridge the visual gap between two consecutive
    // selected blocks. The connector x-range is the overlap of the
    // bordering line rects (the last selected line of the previous block
    // and the first selected line of the next block) so the connector
    // stays as narrow as possible while still bridging both polygons.
    // If the bordering lines don't horizontally overlap at all, the
    // connector degenerates to a 1px-wide bridge at the closer edge so
    // the two clusters merge into one polygon.
    const blockToFirstLineIdx = new Map<SelectionBlock, number>();
    const blockToLastLineIdx = new Map<SelectionBlock, number>();
    for (let i = 0; i < lineInfos.length; i++) {
        const b = lineInfos[i].block;
        if (!b) { continue; }
        if (!blockToFirstLineIdx.has(b)) { blockToFirstLineIdx.set(b, i); }
        blockToLastLineIdx.set(b, i);
    }
    const blockSelected = blocks.map(b =>
        selRange.intersects(OffsetRange.ofStartAndLength(b.absoluteStart, b.block.length))
    );
    for (let i = 0; i < blocks.length - 1; i++) {
        const curr = blocks[i];
        const next = blocks[i + 1];
        const gapStart = curr.absoluteStart + curr.block.length;
        const gapEnd = next.absoluteStart;
        if (gapStart < gapEnd && !selRange.containsRange(OffsetRange.fromTo(gapStart, gapEnd))) { continue; }
        if (gapStart >= gapEnd && !(blockSelected[i] && blockSelected[i + 1])) { continue; }

        const currRect = curr.rect;
        const nextRect = next.rect;
        // Extend through any padding so the connector meets the first
        // visual line of the next block, not just the element top.
        const nextFirstLineTop = _firstLineTopOfBlock(visualLineMap, next, nextRect.top);
        const top = currRect.bottom;
        if (nextFirstLineTop <= top) { continue; }

        const prevLineIdx = blockToLastLineIdx.get(curr);
        const nextLineIdx = blockToFirstLineIdx.get(next);
        // If a bordering block has visible text lines but none of them are
        // selected, the selection only covers that block's hidden markers
        // (e.g. a heading's `## ` when the selection ends right at the
        // rendered title). There is nothing visible to bridge to, so a
        // connector here would hang a stray bar in empty space — skip it.
        // Blocks with no visual lines at all (hr, image, math) still fall
        // back to their element rect below so they can be bridged into.
        if ((prevLineIdx === undefined && _blockHasVisualLine(visualLineMap, curr))
            || (nextLineIdx === undefined && _blockHasVisualLine(visualLineMap, next))) { continue; }
        const prevLR = prevLineIdx !== undefined ? lineRects[prevLineIdx] : { left: currRect.left, right: currRect.right };
        const nextLR = nextLineIdx !== undefined ? lineRects[nextLineIdx] : { left: nextRect.left, right: nextRect.right };

        const left = Math.max(prevLR.left, nextLR.left);
        const right = Math.min(prevLR.right, nextLR.right);
        // No vertical connector when the bordering line rects don't share
        // any x — the polygon clusterer keeps the two stacks as separate
        // subpaths so we don't get a thin "jump" through empty space.
        if (right <= left) { continue; }

        rects.push(toRect(left, top, right, nextFirstLineTop));
    }

    // 3. Blocks with no text leaves (e.g. <hr>, image, math) that are
    // inside the selection range — they produce no visual lines, so fall
    // back to the block element's bounding rect.
    //
    // The check is "does this block own ANY visual line in the map" — not
    // "does it own a *selected* line". A text paragraph whose only selected
    // part is its trailing block-gap (offset at the paragraph's end, e.g.
    // selecting from the end of a line across the blank line below) has a
    // visual line, it just doesn't intersect the selection. Such a block
    // must NOT be filled wholesale; only genuinely leaf-less blocks qualify.
    for (const b of blocks) {
        const blockRange = OffsetRange.ofStartAndLength(b.absoluteStart, b.block.length);
        if (!selRange.intersects(blockRange)) { continue; }
        if (_blockHasVisualLine(visualLineMap, b)) { continue; }
        rects.push(b.rect);
    }

    return rects;
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

/**
 * Whether `block` owns at least one rendered visual line. Leaf-less blocks
 * (<hr>, image, math) own none; every text block owns at least one.
 */
function _blockHasVisualLine(visualLineMap: VisualLineMap, block: SelectionBlock): boolean {
    const blockRange = OffsetRange.ofStartAndLength(block.absoluteStart, block.block.length);
    for (const line of visualLineMap.sourceLines) {
        const lineRange = _lineSourceRange(line);
        if (lineRange && blockRange.containsRange(lineRange)) { return true; }
    }
    return false;
}

/**
 * Horizontal viewport bounds (editor-local coordinates) a block clips its content to when
 * it scrolls horizontally (code / math / unhandled blocks are `overflow-x:
 * auto`; a table scrolls inside its `.md-table-wrapper`), or `undefined` when
 * the block does not overflow — so only blocks that actually scroll get their
 * selection (or caret) clipped, leaving every other block (and its gutter
 * markers) untouched.
 */
export function blockViewportClip(block: SelectionBlock | undefined): { left: number; right: number } | undefined {
    return block?.viewportClip;
}

/** The block whose source range contains `offset`, or `undefined`. */
export function blockContainingOffset(blocks: readonly SelectionBlock[], offset: number): SelectionBlock | undefined {
    return blocks.find(b => offset >= b.absoluteStart && offset <= b.absoluteStart + b.block.length);
}

/**
 * Top of the first visual line whose source range falls inside `block`.
 * Falls back to `fallback` (the block element's top) when the block
 * itself has no text leaves (e.g. <hr>, image, math).
 */
function _firstLineTopOfBlock(visualLineMap: VisualLineMap, block: SelectionBlock, fallback: number): number {
    const blockRange = OffsetRange.ofStartAndLength(block.absoluteStart, block.block.length);
    for (const line of visualLineMap.sourceLines) {
        const lineRange = _lineSourceRange(line);
        if (lineRange && blockRange.containsRange(lineRange)) {
            return line.rect.top;
        }
    }
    return fallback;
}

// ---------- polygon ---------------------------------------------------

interface PolygonCorner {
    readonly x: number;
    readonly y: number;
    /** True for outer corners (rounded outward), false for inner (rounded inward). */
    readonly convex: boolean;
}

/**
 * Build one connected SVG path for `rects`. Each cluster of rects that
 * are *both* vertically adjacent and horizontally overlapping with the
 * previous rect becomes one closed sub-shape; any rect that fails either
 * condition starts a new sub-shape. This is what prevents thin "jumps"
 * through empty space when two y-adjacent selected lines don't share any
 * x range (e.g. end-of-paragraph vs. start-of-heading further left).
 */
export function buildConnectedPath(rects: readonly SelectionRect[], radius: number): string {
    if (rects.length === 0) { return ''; }
    const sorted = rects.slice().sort((a, b) => a.y - b.y || a.x - b.x);

    const clusters: SelectionRect[][] = [];
    let current: SelectionRect[] = [];
    for (const r of sorted) {
        const prev = current[current.length - 1];
        const yTouches = prev !== undefined && r.y <= prev.y + prev.height + 0.5;
        const xOverlaps = prev !== undefined && Math.max(prev.x, r.x) < Math.min(prev.x + prev.width, r.x + r.width);
        if (yTouches && xOverlaps) {
            current.push(r);
        } else {
            if (current.length > 0) { clusters.push(current); }
            current = [r];
        }
    }
    if (current.length > 0) { clusters.push(current); }

    return clusters.map(c => _buildClusterPath(c, radius)).filter(Boolean).join(' ');
}

/**
 * Walk one vertically-adjacent cluster of rects clockwise:
 *   top edge of first → down the right side (with steps between lines) →
 *   bottom edge of last → up the left side (with steps).
 * Each axis-aligned 90° turn is rendered with a rounded arc.
 */
function _buildClusterPath(rects: SelectionRect[], radius: number): string {
    const corners: PolygonCorner[] = [];

    // Right side, top to bottom.
    corners.push({ x: rects[0].x + rects[0].width, y: rects[0].y, convex: true });
    for (let i = 0; i < rects.length - 1; i++) {
        const a = rects[i];
        const b = rects[i + 1];
        const aRight = a.x + a.width;
        const bRight = b.x + b.width;
        if (Math.abs(aRight - bRight) > 0.5) {
            const y = a.y + a.height;
            const aConvex = aRight > bRight;
            corners.push({ x: aRight, y, convex: aConvex });
            corners.push({ x: bRight, y, convex: !aConvex });
        }
    }
    const last = rects[rects.length - 1];
    corners.push({ x: last.x + last.width, y: last.y + last.height, convex: true });

    // Left side, bottom to top.
    corners.push({ x: last.x, y: last.y + last.height, convex: true });
    for (let i = rects.length - 1; i > 0; i--) {
        const a = rects[i];
        const b = rects[i - 1];
        if (Math.abs(a.x - b.x) > 0.5) {
            const y = a.y;
            const aConvex = a.x < b.x;
            corners.push({ x: a.x, y, convex: aConvex });
            corners.push({ x: b.x, y, convex: !aConvex });
        }
    }
    corners.push({ x: rects[0].x, y: rects[0].y, convex: true });

    return _polygonToRoundedPath(corners, radius);
}

function _polygonToRoundedPath(corners: readonly PolygonCorner[], radius: number): string {
    const n = corners.length;
    if (n < 3) { return ''; }

    const radii: number[] = new Array(n);
    for (let i = 0; i < n; i++) {
        const prev = corners[(i + n - 1) % n];
        const next = corners[(i + 1) % n];
        const dPrev = _dist(corners[i], prev);
        const dNext = _dist(corners[i], next);
        radii[i] = Math.min(radius, dPrev / 2, dNext / 2);
    }

    // Approach point of corner 0 on the edge corner[n-1] → corner[0].
    const start = _moveFrom(corners[n - 1], corners[0], _dist(corners[n - 1], corners[0]) - radii[0]);
    const parts: string[] = [`M${_fmt(start.x)},${_fmt(start.y)}`];

    for (let i = 0; i < n; i++) {
        const curr = corners[i];
        const next = corners[(i + 1) % n];
        const r = radii[i];

        // Arc from approach point of `curr` to departure point on the next edge.
        const depart = _moveFrom(curr, next, r);
        if (r > 0) {
            parts.push(`A${_fmt(r)},${_fmt(r)} 0 0 ${curr.convex ? 1 : 0} ${_fmt(depart.x)},${_fmt(depart.y)}`);
        } else {
            parts.push(`L${_fmt(depart.x)},${_fmt(depart.y)}`);
        }

        // Line along the edge up to the approach point of the next corner.
        const nextR = radii[(i + 1) % n];
        const approach = _moveFrom(curr, next, _dist(curr, next) - nextR);
        parts.push(`L${_fmt(approach.x)},${_fmt(approach.y)}`);
    }

    parts.push('Z');
    return parts.join(' ');
}

function _dist(a: { x: number; y: number }, b: { x: number; y: number }): number {
    return Math.hypot(a.x - b.x, a.y - b.y);
}

function _moveFrom(from: { x: number; y: number }, to: { x: number; y: number }, dist: number): { x: number; y: number } {
    const dx = to.x - from.x;
    const dy = to.y - from.y;
    const len = Math.hypot(dx, dy);
    if (len === 0) { return { x: from.x, y: from.y }; }
    const t = dist / len;
    return { x: from.x + dx * t, y: from.y + dy * t };
}

function _isEmptyLineIconRun(run: VisualRun): boolean {
    const source = run.source;
    if (!source) { return false; }
    if (source.textNode.data[source.textNodeStart] !== '↵') { return false; }
    const parent = source.textNode.parentElement;
    if (!parent?.classList.contains('md-ws-newline-glyph')) { return false; }
    const glue = parent.parentElement;
    return !!glue && (glue.classList.contains('md-glue-blockGap') || glue.classList.contains('md-glue-blockQuoteSourceGap'));
}

function _fmt(n: number): string {
    return n.toFixed(2);
}
