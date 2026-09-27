import { Disposable } from '@vscode/observables';
import type { OffsetRange } from '../../core/offsetRange.js';
import { DiffDecorationViewNode, DiffHunkViewNode } from '../content/blockView.js';
import type { ViewNode } from '../content/viewNode.js';
import { rangesForOffsets } from '../diffHighlight.js';
import { EditorCoordinateSpace } from '../editorCoordinateSpace.js';

/**
 * Paints diff word/character highlights as an absolutely-positioned overlay of
 * rectangles — the same technique the selection layer uses (geometry from the
 * rendered DOM, no mutation of the content). Green rects cover inserted/changed
 * modified text; red rects cover deleted text inside the read-only
 * decorations/hunks. Client rectangles are converted through the editor's
 * coordinate boundary before being written to the local overlay.
 */
export class DiffHighlightsView extends Disposable {
	readonly element: HTMLElement;
	private _last: { readonly node: ViewNode; readonly inserted?: readonly OffsetRange[] } | undefined;
	private readonly _resizeObserver: ResizeObserver;
	private readonly _coordinateSpace: EditorCoordinateSpace;
	private readonly _coordinateProbe: SVGSVGElement | undefined;

	constructor(private readonly _parent: HTMLElement, coordinateSpace?: EditorCoordinateSpace) {
		super();
		this.element = document.createElement('div');
		this.element.className = 'md-diff-highlight-layer';
		if (coordinateSpace) {
			this._coordinateSpace = coordinateSpace;
			this._coordinateProbe = undefined;
		} else {
			this._coordinateProbe = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
			this._coordinateProbe.setAttribute('aria-hidden', 'true');
			this._coordinateProbe.style.position = 'absolute';
			this._coordinateProbe.style.inset = '0';
			this._coordinateProbe.style.width = '100%';
			this._coordinateProbe.style.height = '100%';
			this._coordinateProbe.style.visibility = 'hidden';
			this._coordinateProbe.style.pointerEvents = 'none';
			this.element.appendChild(this._coordinateProbe);
			this._coordinateSpace = EditorCoordinateSpace.forSvgOverlay(this._coordinateProbe);
		}
		// Repaint on size changes — this also covers the first render happening
		// before the view is attached/laid out (so the initial rects would be
		// empty), since attachment changes the observed size.
		this._resizeObserver = new ResizeObserver(() => { if (this._last) { this._repaint(this._last); } });
		this._resizeObserver.observe(this._parent);
		this._register({ dispose: () => { this._resizeObserver.disconnect(); this.element.remove(); } });
	}

	clear(): void {
		this._last = undefined;
		this._replaceHighlights();
	}

	/**
	 * Repaint the highlights for the given view-node tree. `insertedRanges`
	 * (modified-document offsets) are painted green when supplied (editor diff
	 * mode); a {@link DiffHunkViewNode}'s own sides supply both colours (the
	 * standalone read-only diff). Deleted ranges from {@link DiffDecorationViewNode}s
	 * are always painted red.
	 */
	render(documentNode: ViewNode, insertedRanges?: readonly OffsetRange[]): void {
		this._last = { node: documentNode, inserted: insertedRanges };
		this._repaint(this._last);
	}

	private _repaint(last: { readonly node: ViewNode; readonly inserted?: readonly OffsetRange[] }): void {
		const green: Range[] = [];
		const red: Range[] = [];
		if (last.inserted) { green.push(...rangesForOffsets(last.node, last.inserted)); }

		const walk = (n: ViewNode): void => {
			if (n instanceof DiffDecorationViewNode) {
				// Whole-block removals show a solid band only (no word rects).
				if (!n.whole) { red.push(...rangesForOffsets(n.sideNode, n.deletedRanges.map(r => r.range))); }
			} else if (n instanceof DiffHunkViewNode) {
				for (const side of n.sides) {
					for (const r of side.ranges) {
						const rs = rangesForOffsets(side.node, [r.range]);
						(r.kind === 'inserted' ? green : red).push(...rs);
					}
				}
			}
			for (const c of n.children) { walk(c); }
		};
		walk(last.node);
		this._paint(green, red);
	}

	private _paint(green: readonly Range[], red: readonly Range[]): void {
		const transform = this._coordinateSpace.capture();
		const frag = document.createDocumentFragment();
		const add = (ranges: readonly Range[], cls: string): void => {
			for (const range of ranges) {
				for (const rect of range.getClientRects()) {
					if (rect.width === 0 || rect.height === 0) { continue; }
					const localRect = transform.toLocalRect(rect);
					const el = document.createElement('div');
					el.className = cls;
					el.style.left = `${localRect.left}px`;
					el.style.top = `${localRect.top}px`;
					el.style.width = `${localRect.width}px`;
					el.style.height = `${localRect.height}px`;
					frag.appendChild(el);
				}
			}
		};
		add(green, 'md-diff-ins-rect');
		add(red, 'md-diff-del-rect');
		this._replaceHighlights(frag);
	}

	private _replaceHighlights(...nodes: Node[]): void {
		const children = this._coordinateProbe ? [this._coordinateProbe, ...nodes] : nodes;
		this.element.replaceChildren(...children);
	}
}
