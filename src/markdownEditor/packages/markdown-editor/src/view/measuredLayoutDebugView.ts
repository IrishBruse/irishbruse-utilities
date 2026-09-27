import { Disposable, autorun, derived, observableValue, type IObservable, type ISettableObservable } from '@vscode/observables';
import type { BlockMeasurement, MeasuredLayoutModel } from '../model/measuredLayoutModel.js';
import type { ViewNode } from './content/viewNode.js';
import type { EditorCoordinateSpace, EditorCoordinateTransform } from './editorCoordinateSpace.js';

const _SHOW_LINE_RECTS_KEY = 'md-debug-show-line-rects';

function _readStoredBool(key: string, fallback: boolean): boolean {
    try {
        const v = localStorage.getItem(key);
        return v === null ? fallback : v === 'true';
    } catch {
        return fallback;
    }
}

function _writeStoredBool(key: string, value: boolean): void {
    try {
        localStorage.setItem(key, String(value));
    } catch {
        // Ignore: debug-only, storage may be unavailable.
    }
}

export interface MeasuredLayoutDebugViewOptions {
    readonly model: MeasuredLayoutModel;
    readonly coordinateSpace: EditorCoordinateSpace;
    /**
     * DEBUG ONLY. Maps an absolute source offset to a fill color for that
     * character's glyph rect. The fixture passes the same function to the
     * raw-source view so a character and its rect share one color — a
     * mismatch exposes a source ↔ DOM mapping bug.
     */
    readonly colorForOffset?: (offset: number) => string | undefined;
    /**
     * DEBUG ONLY. Shared "currently hovered source offset". When set, the
     * overlay isolates the matching glyph rect; the fixture passes the same
     * observable to the raw-source view so hovering either side highlights the
     * same character in both. Hovering a rect writes this; `undefined` clears.
     */
    readonly hoveredOffset?: ISettableObservable<number | undefined>;
}

/**
 * Debug view for a {@link MeasuredLayoutModel}.
 *
 * Exposes two DOM nodes the caller can place independently:
 *
 *  - {@link overlayElement} — absolutely positioned; the caller mounts it
 *    inside the editor overlay container so dashed line-bands and run-boxes
 *    share the measured editor-local coordinates.
 *  - {@link infoElement} — block-flow; the caller mounts it as a sibling
 *    *below* the editor. Contains the per-block summary table that used
 *    to live on the overlay.
 *
 * Same pattern as `CursorView` / `SelectionView`: the rendering pipeline
 * is a single `derived` whose compute callback writes the DOM and returns
 * a {@link MeasuredLayoutDebugRendering} value as proof. An autorun keeps
 * the derived subscribed.
 */
export class MeasuredLayoutDebugView extends Disposable {
    readonly overlayElement: HTMLElement;
    readonly infoElement: HTMLElement;
    readonly rendering: IObservable<MeasuredLayoutDebugRendering>;

    /** Absolute source offsets that map to a rendered DOM character. */
    readonly mappedOffsets: IObservable<ReadonlySet<number>>;

    /** Whether the dashed line-bands and run boxes are drawn (persisted). */
    private readonly _showLineRects = observableValue(this, _readStoredBool(_SHOW_LINE_RECTS_KEY, true));

    constructor(
        _overlayParent: HTMLElement,
        options: MeasuredLayoutDebugViewOptions,
    ) {
        super();

        this.overlayElement = document.createElement('div');
        this.overlayElement.className = 'md-debug-layout-overlay';
        Object.assign(this.overlayElement.style, {
            position: 'absolute',
            top: '0',
            left: '0',
            right: '0',
            bottom: '0',
            pointerEvents: 'none',
        } satisfies Partial<CSSStyleDeclaration>);

        this.infoElement = document.createElement('div');
        this.infoElement.className = 'md-debug-layout-info';
        Object.assign(this.infoElement.style, {
            fontFamily: 'monospace',
            fontSize: '11px',
            padding: '8px 12px',
            background: '#111',
            color: '#fff',
            borderRadius: '4px',
            lineHeight: '1.4',
        } satisfies Partial<CSSStyleDeclaration>);

        // Controls row (survives re-render) + a text element the render rewrites.
        const controls = document.createElement('label');
        Object.assign(controls.style, {
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            marginBottom: '6px',
            cursor: 'pointer',
            userSelect: 'none',
        } satisfies Partial<CSSStyleDeclaration>);
        const checkbox = document.createElement('input');
        checkbox.type = 'checkbox';
        checkbox.checked = this._showLineRects.get();
        checkbox.addEventListener('change', () => {
            this._showLineRects.set(checkbox.checked, undefined);
            _writeStoredBool(_SHOW_LINE_RECTS_KEY, checkbox.checked);
        });
        controls.appendChild(checkbox);
        controls.appendChild(document.createTextNode('show line rects'));
        this.infoElement.appendChild(controls);

        const text = document.createElement('pre');
        text.style.margin = '0';
        text.style.whiteSpace = 'pre';
        this.infoElement.appendChild(text);

        this.rendering = derived(this, reader => {
            const measurements = reader.readObservable(options.model.measurements);
            const showLineRects = reader.readObservable(this._showLineRects);
            return _renderDebug(
                this.overlayElement,
                text,
                measurements,
                options.coordinateSpace,
                showLineRects,
                options.colorForOffset,
                options.hoveredOffset,
            );
        });

        this.mappedOffsets = derived(this, reader => reader.readObservable(this.rendering).mappedOffsets);

        // Re-read `rendering` so isolation re-applies after every rebuild, and
        // `hoveredOffset` so hovering either view isolates the matching rect.
        this._register(autorun(reader => {
            reader.readObservable(this.rendering);
            const hovered = options.hoveredOffset ? reader.readObservable(options.hoveredOffset) : undefined;
            if (options.hoveredOffset) { applyHoverIsolation(this.overlayElement, hovered); }
        }));
    }
}


/**
 * Immutable record of one rendered debug frame.
 */
export class MeasuredLayoutDebugRendering {
    constructor(
        readonly blockCount: number,
        readonly mountedCount: number,
        readonly lineCount: number,
        /** Absolute source offsets that map to a rendered DOM character. */
        readonly mappedOffsets: ReadonlySet<number>,
    ) { }
}

function _renderDebug(
    overlay: HTMLElement,
    info: HTMLElement,
    measurements: readonly BlockMeasurement[],
    coordinateSpace: EditorCoordinateSpace,
    showLineRects: boolean,
    colorForOffset?: (offset: number) => string | undefined,
    hoveredOffset?: ISettableObservable<number | undefined>,
): MeasuredLayoutDebugRendering {
    overlay.textContent = '';
    const transform = coordinateSpace.capture();

    let mountedCount = 0;
    let lineCount = 0;
    let charCount = 0;
    const mappedOffsets = new Set<number>();

    for (let i = 0; i < measurements.length; i++) {
        const m = measurements[i];
        const lines = m.visualLineMap?.lines ?? [];
        if (m.isMeasured) { mountedCount++; }
        lineCount += lines.length;

        if (showLineRects) {
            for (let li = 0; li < lines.length; li++) {
                const line = lines[li];
                const lineRect = line.rect;
                const band = document.createElement('div');
                Object.assign(band.style, {
                    position: 'absolute',
                    left: '0',
                    right: '0',
                    top: `${lineRect.y}px`,
                    height: `${lineRect.height}px`,
                    border: '1px dashed rgba(180, 0, 200, 0.45)',
                    boxSizing: 'border-box',
                } satisfies Partial<CSSStyleDeclaration>);
                overlay.appendChild(band);

                for (const run of line.runs) {
                    const runBox = document.createElement('div');
                    Object.assign(runBox.style, {
                        position: 'absolute',
                        left: `${run.rect.x}px`,
                        top: `${run.rect.y}px`,
                        width: `${run.rect.width}px`,
                        height: `${run.rect.height}px`,
                        outline: '1px solid rgba(255, 100, 0, 0.45)',
                        boxSizing: 'border-box',
                    } satisfies Partial<CSSStyleDeclaration>);
                    overlay.appendChild(runBox);
                }
            }
        }

        // Per-character glyph rects (mounted blocks only). Resolve each source
        // offset back to a DOM position through the production source ↔ DOM
        // mapping, so a misplaced rect reveals a mapping bug.
        if (m.viewNode) {
            charCount += _appendCharRects(overlay, transform, m.viewNode, m.absoluteStart, mappedOffsets, colorForOffset, hoveredOffset);
        }
    }

    const header = `blocks: ${measurements.length}   mounted: ${mountedCount}   lines: ${lineCount}   chars: ${charCount}`;
    const rows = measurements.map((m, i) => {
        const flag = m.isMeasured ? 'M' : 'e';
        const lc = m.visualLineMap?.lines.length ?? 0;
        return `${String(i).padStart(2)} ${flag} start=${String(m.absoluteStart).padStart(4)} h=${m.height.toFixed(1).padStart(6)} lines=${lc} kind=${m.block.kind}`;
    });
    info.textContent = [header, ...rows].join('\n');

    return new MeasuredLayoutDebugRendering(measurements.length, mountedCount, lineCount, mappedOffsets);
}

/**
 * Draw one filled box per character of the block's source range. Each source
 * offset `o` is mapped to a DOM position with {@link ViewNode.sourceToDom}
 * (the same mapping the cursor uses), and `[o, o+1)` is measured with a
 * `Range`. The box is filled (no border) with {@link colorForOffset}`(o)` so
 * it matches the same character in the raw-source view.
 *
 * Each box carries `data-offset` so {@link applyHoverIsolation} can isolate it.
 * Hovering a box writes its offset into {@link hoveredOffset} (shared with the
 * raw-source view); when no shared observable is supplied it falls back to a
 * local overlay-only isolation. Returns the number of character boxes appended.
 */
function _appendCharRects(
    overlay: HTMLElement,
    transform: EditorCoordinateTransform,
    viewNode: ViewNode,
    blockAbsoluteStart: number,
    mappedOffsets: Set<number>,
    colorForOffset?: (offset: number) => string | undefined,
    hoveredOffset?: ISettableObservable<number | undefined>,
): number {
    let count = 0;
    const range = document.createRange();
    const end = blockAbsoluteStart + viewNode.sourceLength;
    // Source offsets actually backed by a rendered DOM Text leaf. Characters
    // outside any leaf (list markers `- `, newlines, other syntax) are not
    // rendered, so we must not draw a rect for them. `sourceToDom` alone can't
    // tell them apart because it clamps unmapped offsets to an adjacent leaf's
    // boundary; the leaf coverage from `forEachTextLeaf` is authoritative.
    const covered: Array<{ start: number; end: number }> = [];
    viewNode.forEachTextLeaf(blockAbsoluteStart, (leaf, leafOffset) => {
        covered.push({ start: leafOffset, end: leafOffset + leaf.sourceLength });
    });
    const isCovered = (o: number) => covered.some(r => o >= r.start && o < r.end);
    for (let o = blockAbsoluteStart; o < end; o++) {
        if (!isCovered(o)) { continue; }
        // The character occupies source range [o, o+1). Use its END position to
        // identify the rendered DOM character, then step back one within the
        // same Text node to get its start.
        const b = viewNode.sourceToDom(o + 1, blockAbsoluteStart);
        if (!b || b.offset < 1) { continue; }
        range.setStart(b.node, b.offset - 1);
        range.setEnd(b.node, b.offset);
        const clientRect = range.getBoundingClientRect();
        // A character with no height isn't laid out at all — skip it. A
        // zero-WIDTH rect, though, is a real mapped character that simply has no
        // advance (a `\n` inside a code block maps to a real `\n` Text node):
        // render it as a thin 2px line so the mapping is still visible.
        if (clientRect.height === 0) { continue; }
        const rect = transform.toLocalRect(clientRect);
        const drawWidth = rect.width === 0 ? 2 : rect.width;
        const box = document.createElement('div');
        Object.assign(box.style, {
            position: 'absolute',
            left: `${rect.x}px`,
            top: `${rect.y}px`,
            width: `${drawWidth}px`,
            height: `${rect.height}px`,
            background: colorForOffset?.(o) ?? 'rgba(0, 120, 220, 0.30)',
            boxSizing: 'border-box',
            pointerEvents: 'auto',
        } satisfies Partial<CSSStyleDeclaration>);
        const ch = (b.node as Text).data?.[b.offset - 1] ?? '';
        box.title = `offset ${o}: ${JSON.stringify(ch)}`;
        box.dataset.offset = String(o);
        if (hoveredOffset) {
            box.addEventListener('mouseenter', () => hoveredOffset.set(o, undefined));
            box.addEventListener('mouseleave', () => hoveredOffset.set(undefined, undefined));
        } else {
            box.addEventListener('mouseenter', () => _isolate(overlay, box, true));
            box.addEventListener('mouseleave', () => _isolate(overlay, box, false));
        }
        overlay.appendChild(box);
        mappedOffsets.add(o);
        count++;
    }
    return count;
}

/**
 * Show only the element whose `data-offset` equals `hovered`, hiding every
 * other child (and all children lacking a `data-offset`, e.g. line bands).
 * When `hovered` is `undefined` everything is restored. `visibility: hidden`
 * preserves layout so the source view's text never reflows.
 *
 * Used identically for the editor overlay and the raw-source view, so a hover
 * on either side highlights the same character in both. Debug-only.
 */
export function applyHoverIsolation(container: HTMLElement, hovered: number | undefined): void {
    for (const el of Array.from(container.children) as HTMLElement[]) {
        if (!el.style) { continue; }
        const off = el.dataset.offset;
        const matches = off !== undefined && Number(off) === hovered;
        el.style.visibility = hovered === undefined || matches ? '' : 'hidden';
    }
}

/**
 * Show only `keep` (when `on`) or restore every overlay element (when `off`).
 * Debug-only, so the brute-force walk over all siblings is fine.
 */
function _isolate(overlay: HTMLElement, keep: HTMLElement, on: boolean): void {
    for (const el of Array.from(overlay.children) as HTMLElement[]) {
        el.style.visibility = on && el !== keep ? 'hidden' : '';
    }
}
