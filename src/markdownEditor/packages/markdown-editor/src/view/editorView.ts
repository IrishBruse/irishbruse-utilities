import { Disposable, autorun, constObservable, derived, observableValue } from '@vscode/observables';
import type { IDisposable, IObservable, IReader } from '@vscode/observables';
import { Point2D, Rect2D } from '../core/geometry.js';
import type { SourceOffset } from '../core/sourceOffset.js';
import { OffsetRange } from '../core/offsetRange.js';
import type { EditorModel } from '../model/editorModel.js';
import { VideoAstNode, type BlockAstNode } from '../parser/ast.js';
import { MeasuredLayoutModel, type BlockMeasurement, type VirtualLineMeasurement } from '../model/measuredLayoutModel.js';
import { caretDomPositionFromPoint } from './content/dom.js';
import type { BlockViewOptions } from './content/blockView.js';
import { DocumentViewNode, type DocumentBlock } from './content/documentView.js';
import { ViewNode } from './content/viewNode.js';
import { EditorCoordinateSpace } from './editorCoordinateSpace.js';
import { buildDocumentViewData, applyDiffDecorations, type DocumentViewData } from './viewData.js';
import { DiffHighlightsView } from './parts/diffHighlightsView.js';
import { CursorView } from './parts/cursorView.js';
import { GutterMarkersView } from './parts/gutterMarkersView.js';
import { SelectionView, type SelectionBlock, type SelectionRect, computeRangeRects } from './parts/selectionView.js';
import { VisualLine, VisualLineMap } from './visualLineMap.js';
import { shouldAutoFocusOnOpen, shouldDeferAutoFocus, type AutoFocusEnvironment } from './autoFocus.js';
import { mappedRangesForOffsets } from './diffHighlight.js';
import { clientDeltaToScrollDelta, clientRectContains, elementScrollsContentVertically, getClippingClientRect, getElementClientRect, getElementScrollDestination, getScrollableAncestors, getWindowScrollDestination, type ScrollDestination } from './scrolling.js';

/** Default max content width (px) used when {@link EditorViewOptions.limitedWidth} is omitted. */
const DEFAULT_LIMITED_WIDTH = 900;
const NEAREST_REVEAL_MARGIN = 2;
/** VS Code's effective default: max(cursorSurroundingLines, stickyScroll.maxLineCount). */
const CARET_SURROUNDING_LINES = 5;
/**
 * Baseline vertical breathing room (px) left above an explicitly navigated
 * target so it does not sit flush against the top of its viewport. Registered
 * reveal occlusions covering that viewport's top grow the effective inset so
 * the same room is kept below them.
 */
const TOP_REVEAL_CONTEXT_INSET = 16;

/**
 * How a revealed target is positioned inside its viewport: centered, moved just
 * far enough to become visible, or aligned with the viewport top plus
 * {@link TOP_REVEAL_CONTEXT_INSET} of navigation context.
 */
type RevealAlignment = 'center' | 'nearest' | 'top';

export interface EditorViewOptions extends BlockViewOptions {
	/**
	 * Extra class names added to the editor root element, e.g. a theme class
	 * such as `'md-theme-default'` or `'github-markdown-theme'`. Theme styles
	 * are scoped under these classes, so the editor is unstyled (base chrome
	 * only) unless a theme class is supplied.
	 */
	readonly classNames?: readonly string[];

	/**
	 * Whether to render the sticky edit/read-only toggle at the top-right edge
	 * of the content. Defaults to `true`; set to `false` to omit it (e.g. in
	 * fixtures that focus on selection rendering).
	 */
	readonly showReadonlyToggle?: boolean;

	/**
	 * Controls "limited width mode". The observable yields the maximum content
	 * width in pixels, or `undefined` to let the content fill the available
	 * width. When the option is omitted, the width is capped at
	 * {@link DEFAULT_LIMITED_WIDTH}px (limited mode is on by default).
	 *
	 * The cap and centering apply to an inner content container; the editor
	 * root ({@link element}) always spans the full available width.
	 */
	readonly limitedWidth?: IObservable<number | undefined>;

	/**
	 * Diff mode only: render every read-only original decoration in active
	 * (source) form, so even whole-block removals expose their markdown markers
	 * as real text. Used by the diff-coverage fixture to verify that every
	 * changed original character is rendered somewhere; off in normal use, where
	 * whole removals show a clean solid band.
	 */
	readonly diffDecorationsActive?: boolean;
}

export type EditorOverlayPosition = 'top-chrome' | 'below-selection' | 'above-decorations';

/**
 * Pure-render view of an {@link EditorModel}.
 *
 * Invariant (the whole point of this file):
 *
 *     view(model + Δ) = view(model) + Δ
 *
 * The DOM the view produces is a function of the model. The only state the
 * view holds is *DOM management*: the cached `BlockViewNode` instances and the
 * `EditContext`. Anything that influences correctness but is not derivable
 * from the model lives elsewhere:
 *
 *   - measured heights and per-block visual line maps  →  {@link MeasuredLayoutModel}
 *   - desired column, drag-time freeze                 →  EditorController
 *
 * The view does not own a controller — callers construct an
 * `EditorController` separately and pass it the view, so input handling is
 * explicit and the view stays a pure renderer.
 *
 * The view writes into the measured-layout model as a side effect of
 * rendering. It never reads its own measurements during rendering, so
 * there is no feedback loop.
 */
export class EditorView extends Disposable {
	readonly element: HTMLElement;
	readonly editContext: EditContext;
	readonly measuredLayout: MeasuredLayoutModel;
	readonly coordinateSpace: EditorCoordinateSpace;
	readonly forcedMarkerVisibleBlocks = observableValue<ReadonlySet<BlockAstNode>>(this, new Set());

	/**
	 * Inner container that holds the rendered document and the cursor/selection
	 * overlays. The outer {@link element} spans the full width; this container
	 * is what limited-width mode caps and centers, so the overlays (which anchor
	 * to their parent's box) stay aligned with the content.
	 */
	private readonly _contentContainer: HTMLElement;
	private readonly _resizeObserver: ResizeObserver;

	private readonly _cursorView: CursorView;
	private readonly _selectionView: SelectionView;
	private readonly _gutterMarkersView: GutterMarkersView;
	private readonly _diffHighlightsView: DiffHighlightsView;
	private _readonlyToggleButton: HTMLButtonElement | undefined;
	private readonly _editContextSuspensions = new Set<HTMLElement>();
	private readonly _revealOcclusions = new Set<Element>();
	private _pendingTopReveal: IDisposable | undefined;
	private _caretRevealRaf: number | undefined;
	private _followedCaretBlock: { readonly element: HTMLElement; readonly height: number } | undefined;
	private _followCaretAfterEdit = false;

	/**
	 * The mounted block sequence, in source order. Rebuilt (not mutated) each
	 * frame by {@link DocumentViewNode.create}; the view just swaps one
	 * immutable node for the next. Never used for source-of-truth lookups
	 * (those go through the measured-layout model).
	 */
	private readonly _document = observableValue<DocumentViewNode | undefined>(this, undefined);
	private readonly _embeddedCodeEditorFactoryVersion = observableValue(this, 0);
	private readonly _suspendEditContextForBlockControl = (element: HTMLElement): IDisposable =>
		this.suspendEditContextWhileFocused(element);
	/** The current view-node tree (AST overlaid with rendered DOM), for debugging. */
	public get documentViewNode(): IObservable<DocumentViewNode | undefined> { return this._document; }

	/** Re-resolves embedded code editors while preserving the surrounding editor view. */
	public refreshEmbeddedCodeEditors(): void {
		this._embeddedCodeEditorFactoryVersion.set(this._embeddedCodeEditorFactoryVersion.get() + 1, undefined);
	}

	/**
	 * Last frame's view-data overlay, threaded back into
	 * {@link buildDocumentViewData} so any subtree whose ast and selection flags
	 * are unchanged keeps its view-data object — which lets the renderer reuse
	 * its DOM by identity.
	 */
	private _previousViewData: DocumentViewData | undefined;

	/** The current view-data tree (AST overlaid with selection flags), for debugging. */
	private readonly _viewData = observableValue<DocumentViewData | undefined>(this, undefined);
	public get viewData(): IObservable<DocumentViewData | undefined> { return this._viewData; }

	/**
	 * Whether the editor is genuinely focused: focus rests somewhere inside the
	 * editor subtree *and* its window is focused. Mirrored onto the root as
	 * `.md-focused`, which gates the painted caret — the blinking cursor is only
	 * shown while this is `true`, so it never blinks in an unfocused editor or
	 * after the window loses focus. Only the caret's visibility is affected; the
	 * logical selection and caret geometry ({@link caretRect}) are unchanged.
	 */
	private readonly _focused = observableValue<boolean>(this, false);
	public get focused(): IObservable<boolean> { return this._focused; }

	/**
	 * The block cache projected for views (selection painting) that need to
	 * react to mount/unmount. Derived from {@link _document}, so it stays in
	 * lock-step without any manual bookkeeping.
	 */
	private readonly _selectionBlocksObs = derived(this, reader => {
		const measurements = this.measuredLayout.measurements.read(reader);
		return measurements.flatMap((measurement): SelectionBlock[] => {
			if (!measurement.rect || !measurement.viewNode) { return []; }
			return [{
				block: measurement.block,
				absoluteStart: measurement.absoluteStart,
				rect: measurement.rect,
				viewportClip: measurement.viewportClip,
			}];
		});
	});

	/**
	 * The caret rect (zero width) at the selection's active end, in
	 * {@link overlayContainer}-local coordinates, or `undefined` when there is no
	 * caret. This is the same geometry the editor paints its cursor from, so
	 * contributions (e.g. comment mode) can anchor an overlay to the active end of
	 * the selection — where the user's cursor is — without re-deriving geometry.
	 */
	private readonly _caretRect = derived(this, reader => {
		const rendering = this._cursorView.rendering.read(reader);
		return rendering.visible ? rendering.rect : undefined;
	});
	public get caretRect(): IObservable<Rect2D | undefined> { return this._caretRect; }

	/**
	 * The container that establishes the positioning context for the editor's
	 * overlays (cursor, selection, gutter). Contributions mount their own
	 * absolutely-positioned overlays here so they share the coordinate space of
	 * {@link caretRect}.
	 */
	public get overlayContainer(): HTMLElement { return this._contentContainer; }

	/**
	 * Selection-style rectangles covering `range`, in {@link overlayContainer}-
	 * local coordinates — the same geometry the live selection paints. Exposed so
	 * contributions (e.g. persistent comments) can highlight arbitrary ranges and
	 * anchor overlays to them. Recomputes when the measured layout changes.
	 */
	public rangeRects(range: OffsetRange): IObservable<readonly SelectionRect[]> {
		return derived(this, reader => {
			const visualLineMap = this.measuredLayout.visualLineMap.read(reader);
			const blocks = this._selectionBlocksObs.read(reader);
			return computeRangeRects(range, visualLineMap, blocks);
		});
	}

	constructor(
		private readonly _model: EditorModel,
		private readonly _options?: EditorViewOptions,
	) {
		super();
		this._register({ dispose: () => this._pendingTopReveal?.dispose() });

		this.element = document.createElement('div');
		this.element.className = 'md-editor';
		if (this._options?.classNames) {
			this.element.classList.add(...this._options.classNames);
		}
		this.element.tabIndex = 0;

		this._contentContainer = document.createElement('div');
		this._contentContainer.className = 'md-editor-content';
		this.element.appendChild(this._contentContainer);

		const limitedWidth = this._options?.limitedWidth ?? constObservable<number | undefined>(DEFAULT_LIMITED_WIDTH);
		this._register(autorun(reader => {
			const width = limitedWidth.read(reader);
			this._contentContainer.style.maxWidth = width === undefined ? '' : `${width}px`;
		}));

		this.measuredLayout = new MeasuredLayoutModel();

		// Re-measure on reflow. The measured layout is otherwise only recomputed
		// when the document model changes. Observe both the content box for width
		// changes and the rendered document for async descendant layout changes.
		let lastMeasuredContentWidth = -1;
		let lastMeasuredContentHeight = -1;
		let lastMeasuredDocumentHeight = -1;
		this._resizeObserver = new ResizeObserver(() => {
			this.element.classList.toggle('md-editor-narrow', this.element.clientWidth <= 320);
			const contentStyle = getComputedStyle(this._contentContainer);
			const usableContentWidth = this._contentContainer.clientWidth
				- parseFloat(contentStyle.paddingLeft)
				- parseFloat(contentStyle.paddingRight);
			this.element.classList.toggle('md-find-compact', usableContentWidth <= 400);
			const doc = this._document.get();
			if (!doc) { return; }
			const width = this._contentContainer.clientWidth;
			const height = this._contentContainer.clientHeight;
			const documentHeight = doc.contentDomNode.getBoundingClientRect().height;
			if (
				Math.abs(width - lastMeasuredContentWidth) < 0.5
				&& Math.abs(height - lastMeasuredContentHeight) < 0.5
				&& Math.abs(documentHeight - lastMeasuredDocumentHeight) < 0.5
			) {
				return;
			}
			lastMeasuredContentWidth = width;
			lastMeasuredContentHeight = height;
			lastMeasuredDocumentHeight = documentHeight;
			this._publishMeasurements(doc);
			this._revealCaretAfterActiveBlockResize();
		});
		this._resizeObserver.observe(this.element);
		this._resizeObserver.observe(this._contentContainer);
		this._register({ dispose: () => this._resizeObserver.disconnect() });

		// Inner blocks (code / math / unhandled, and a wide table inside its
		// `.md-table-wrapper`) scroll horizontally on their own. Scrolling one
		// moves the text within it, so the measured `visualLineMap` — and the
		// selection / cursor geometry derived from it, which is clipped to each
		// block's viewport — goes stale. Re-measure on scroll so the cached line
		// geometry and the live glyph measurements share the current scroll
		// basis. Scroll events don't bubble, so listen in the capture phase;
		// coalesce to one re-measure per frame.
		let scrollRaf = 0;
		const onBlockScroll = () => {
			if (scrollRaf) { return; }
			scrollRaf = requestAnimationFrame(() => {
				scrollRaf = 0;
				const doc = this._document.get();
				if (doc) { this._publishMeasurements(doc); }
			});
		};
		this._contentContainer.addEventListener('scroll', onBlockScroll, { capture: true, passive: true });
		this._register({
			dispose: () => {
				this._contentContainer.removeEventListener('scroll', onBlockScroll, { capture: true });
				if (scrollRaf) { cancelAnimationFrame(scrollRaf); }
			},
		});

		this._selectionView = this._register(new SelectionView({
			selection: this._model.selection,
			visualLineMap: this.measuredLayout.visualLineMap,
			blocks: this._selectionBlocksObs,
		}));
		this._contentContainer.appendChild(this._selectionView.element);
		this.coordinateSpace = EditorCoordinateSpace.forSvgOverlay(this._selectionView.element);

		this._cursorView = this._register(new CursorView({
			position: this._model.cursorPosition,
			visualLineMap: this.measuredLayout.visualLineMap,
			blocks: this._selectionBlocksObs,
		}));
		this._contentContainer.appendChild(this._cursorView.element);

		this._gutterMarkersView = this._register(new GutterMarkersView({
			markers: this._model.gutterMarkers,
			visualLineMap: this.measuredLayout.visualLineMap,
		}));
		this._contentContainer.appendChild(this._gutterMarkersView.element);

		this._diffHighlightsView = this._register(new DiffHighlightsView(this._contentContainer, this.coordinateSpace));
		this._contentContainer.appendChild(this._diffHighlightsView.element);

		this._register(autorun(reader => {
			const readonly = this._model.readonlyMode.read(reader);
			this.element.classList.toggle('md-readonly', readonly);
			if (!readonly) {
				this.element.classList.remove('md-readonly-editing-attempt');
			}
		}));
		if (this._options?.showReadonlyToggle !== false) { this._setupReadonlyToggle(); }

		this.editContext = new EditContext({
			text: this._model.sourceText.get().value,
			selectionStart: 0,
			selectionEnd: 0,
		});
		this.element.editContext = this.editContext;

		this._register(autorun(this._renderAutorun));
		this._setupModifierTracking();
		this._setupFocusTracking();
		this._setupCaretScrollPadding();
		this._register(autorun(reader => {
			const sel = reader.readObservable(this._model.selection)?.range;
			this.editContext.updateSelection(sel?.start ?? 0, sel?.endExclusive ?? 0);
		}));
		this._register({
			dispose: () => {
				this._stopFollowingCaret();
				this._document.get()?.dispose();
				this._clearDiff();
			},
		});
	}

	/**
	 * Mirrors the model's live Ctrl/Cmd state onto the editor root as
	 * `.md-mod-down` so CSS can show the link-open underline and pointer cursor
	 * only while a click would actually open the link: an inactive link opens on
	 * a plain click, but an active link only opens with the modifier held.
	 */
	private _setupModifierTracking(): void {
		this._register(autorun(reader => {
			this.element.classList.toggle('md-mod-down', this._model.ctrlOrMetaDown.read(reader));
		}));
	}

	/**
	 * Tracks whether the editor is genuinely focused and mirrors it onto the
	 * root as `.md-focused` so CSS can gate the painted caret. "Focused" means
	 * focus rests somewhere inside the editor subtree *and* the window itself is
	 * focused; either condition failing (focus moving elsewhere, or the window
	 * losing focus) hides the blinking caret while leaving the logical selection
	 * and caret geometry intact.
	 */
	private _setupFocusTracking(): void {
		const element = this.element;
		const win = element.ownerDocument.defaultView ?? window;

		const focusIsWithin = (): boolean => {
			const active = element.ownerDocument.activeElement;
			return active !== null && element.contains(active);
		};
		const update = (focused: boolean): void => this._focused.set(focused, undefined);

		const onFocusIn = (): void => update(true);
		// `focusout` fires as focus leaves the subtree; `relatedTarget` is the
		// element gaining focus (null when focus leaves the document entirely).
		// Focus staying inside the editor — e.g. moving to the mode toggle —
		// keeps it focused; leaving the subtree clears it.
		const onFocusOut = (event: FocusEvent): void => {
			const next = event.relatedTarget;
			update(next instanceof Node && element.contains(next));
		};
		// A window losing focus does not fire `focusout` on the still-active
		// element, so observe the window directly: hide the caret on blur, and on
		// refocus restore it only when focus actually rests inside the editor.
		const onWindowBlur = (): void => update(false);
		const onWindowFocus = (): void => update(focusIsWithin());

		element.addEventListener('focusin', onFocusIn);
		element.addEventListener('focusout', onFocusOut);
		win.addEventListener('blur', onWindowBlur);
		win.addEventListener('focus', onWindowFocus);
		this._register({
			dispose: () => {
				element.removeEventListener('focusin', onFocusIn);
				element.removeEventListener('focusout', onFocusOut);
				win.removeEventListener('blur', onWindowBlur);
				win.removeEventListener('focus', onWindowFocus);
			},
		});

		this._register(autorun(reader => {
			this.element.classList.toggle('md-focused', this._focused.read(reader));
		}));
	}

	private _setupCaretScrollPadding(): void {
		this._register(autorun(reader => {
			const position = this._model.cursorPosition.read(reader);
			const sourceLength = this._model.sourceText.read(reader).value.length;
			const pending = this._model.pendingParagraph.read(reader);
			const atEnd = position?.kind === 'source'
				? position.offset === sourceLength
				: pending?.atEof === true;
			this._contentContainer.style.paddingBlockEnd = this._focused.read(reader) && atEnd
				? `${CARET_SURROUNDING_LINES}lh`
				: '';
		}));
	}

	/**
	 * Renders the edit/read-only mode toggle. It flips the model's
	 * {@link EditorModel.readonlyMode}: when locked (read-only) every block stays
	 * in its clean rendered form (no markdown markers revealed) and edits are
	 * ignored, while text selection still works. The control lives in a
	 * zero-height *sticky* host inside the centered content container, so the
	 * lock follows the content's right edge and remains pinned as the document
	 * scrolls. The current mode is also mirrored onto the root as `.md-readonly`
	 * for any CSS hooks.
	 */
	private _setupReadonlyToggle(): void {
		const host = document.createElement('div');
		host.className = 'md-readonly-toggle-host';
		this._contentContainer.classList.add('md-editor-content-with-readonly-toggle');

		const button = document.createElement('button');
		button.type = 'button';
		button.className = 'md-readonly-toggle';
		this._readonlyToggleButton = button;

		const indicator = document.createElement('span');
		indicator.className = 'md-readonly-toggle-indicator';
		indicator.setAttribute('aria-hidden', 'true');

		const lockedIcon = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
		lockedIcon.classList.add('md-readonly-toggle-icon', 'md-readonly-toggle-icon-locked');
		lockedIcon.setAttribute('viewBox', '0 0 16 16');
		lockedIcon.setAttribute('fill', 'currentColor');
		lockedIcon.setAttribute('aria-hidden', 'true');

		const lockKeyhole = document.createElementNS('http://www.w3.org/2000/svg', 'path');
		lockKeyhole.setAttribute('d', 'M8 9C8.55228 9 9 9.44771 9 10C9 10.5523 8.55228 11 8 11C7.44772 11 7 10.5523 7 10C7 9.44771 7.44772 9 8 9Z');
		const lockBody = document.createElementNS('http://www.w3.org/2000/svg', 'path');
		lockBody.setAttribute('fill-rule', 'evenodd');
		lockBody.setAttribute('clip-rule', 'evenodd');
		lockBody.setAttribute('d', 'M8 1C9.654 1 11 2.346 11 4V6H12C13.103 6 14 6.897 14 8V13C14 14.103 13.103 15 12 15H4C2.897 15 2 14.103 2 13V8C2 6.897 2.897 6 4 6H5V4C5 2.346 6.346 1 8 1ZM4 7C3.449 7 3 7.449 3 8V13C3 13.551 3.449 14 4 14H12C12.551 14 13 13.551 13 13V8C13 7.449 12.551 7 12 7H4ZM8 2C6.897 2 6 2.897 6 4V6H10V4C10 2.897 9.103 2 8 2Z');
		lockedIcon.append(lockKeyhole, lockBody);

		const editingIcon = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
		editingIcon.classList.add('md-readonly-toggle-icon', 'md-readonly-toggle-icon-editing');
		editingIcon.setAttribute('viewBox', '0 0 16 16');
		editingIcon.setAttribute('fill', 'currentColor');
		editingIcon.setAttribute('aria-hidden', 'true');
		const editingPath = document.createElementNS('http://www.w3.org/2000/svg', 'path');
		editingPath.setAttribute('d', 'M14.236 1.76386C13.2123 0.740172 11.5525 0.740171 10.5289 1.76386L2.65722 9.63549C2.28304 10.0097 2.01623 10.4775 1.88467 10.99L1.01571 14.3755C0.971767 14.5467 1.02148 14.7284 1.14646 14.8534C1.27144 14.9783 1.45312 15.028 1.62432 14.9841L5.00978 14.1151C5.52234 13.9836 5.99015 13.7168 6.36433 13.3426L14.236 5.47097C15.2596 4.44728 15.2596 2.78755 14.236 1.76386ZM11.236 2.47097C11.8691 1.8378 12.8957 1.8378 13.5288 2.47097C14.162 3.10413 14.162 4.1307 13.5288 4.76386L12.75 5.54269L10.4571 3.24979L11.236 2.47097ZM9.75002 3.9569L12.0429 6.24979L5.65722 12.6355C5.40969 12.883 5.10023 13.0595 4.76117 13.1465L2.19447 13.8053L2.85327 11.2386C2.9403 10.8996 3.1168 10.5901 3.36433 10.3426L9.75002 3.9569Z');
		editingIcon.appendChild(editingPath);

		button.append(indicator, lockedIcon, editingIcon);
		host.appendChild(button);

		const onClick = (): void => {
			this._model.toggleReadonlyMode();
		};
		const onPointerDown = (event: PointerEvent): void => {
			if (event.button !== 0) { return; }
			// Keep focus and selection in the editor instead of letting its root
			// pointer handler interpret the toggle as a click on editor padding.
			event.preventDefault();
			event.stopPropagation();
			this.focus();
		};
		const onKeyDown = (event: KeyboardEvent): void => {
			// Let the button perform its native keyboard activation without the
			// event also reaching the editor's navigation and editing commands.
			event.stopPropagation();
		};
		const onAnimationEnd = (event: AnimationEvent): void => {
			if (event.animationName === 'md-readonly-toggle-shine') {
				button.classList.remove('md-readonly-toggle-shine');
			}
		};
		button.addEventListener('pointerdown', onPointerDown);
		button.addEventListener('keydown', onKeyDown);
		button.addEventListener('animationend', onAnimationEnd);
		button.addEventListener('click', onClick);
		this._register(this.suspendEditContextWhileFocused(button));
		this._register({
			dispose: () => {
				button.removeEventListener('pointerdown', onPointerDown);
				button.removeEventListener('keydown', onKeyDown);
				button.removeEventListener('animationend', onAnimationEnd);
				button.removeEventListener('click', onClick);
				if (this._readonlyToggleButton === button) {
					this._readonlyToggleButton = undefined;
				}
			},
		});

		this._register(autorun(reader => {
			const readonly = this._model.readonlyMode.read(reader);
			button.classList.toggle('md-readonly-toggle-locked', readonly);
			button.setAttribute('aria-pressed', String(readonly));
			button.setAttribute('aria-label', readonly
				? 'Locked; switch to editing'
				: 'Editing; switch to locked mode');
			button.title = readonly
				? 'Read-only: markers hidden, editing disabled. Click to edit.'
				: 'Editing: click to lock (hide markers, disable editing).';
			if (!readonly) {
				button.classList.remove('md-readonly-toggle-shine');
			}
		}));

		// Keep the sticky host ahead of the rendered document while anchoring its
		// horizontal position to the limited-width content container.
		this._contentContainer.insertBefore(host, this._contentContainer.firstChild);
	}

	/** Draws attention to the mode toggle after text input is attempted while locked. */
	showReadonlyEditingAttempt(): void {
		const button = this._readonlyToggleButton;
		if (button) {
			if (!button.classList.contains('md-readonly-toggle-shine')) {
				button.classList.add('md-readonly-toggle-shine');
			}
			return;
		}
		this.element.classList.remove('md-readonly-editing-attempt');
		requestAnimationFrame(() => {
			if (this._model.readonlyMode.get()) {
				this.element.classList.add('md-readonly-editing-attempt');
			}
		});
	}

	focus(): void { this.element.focus({ preventScroll: true }); }

	mountOverlay(element: HTMLElement | SVGSVGElement, position: EditorOverlayPosition): IDisposable {
		if (position === 'top-chrome') {
			this._contentContainer.insertBefore(element, this._contentContainer.firstChild);
		} else if (position === 'below-selection') {
			this._contentContainer.insertBefore(element, this._selectionView.element);
		} else {
			this._contentContainer.appendChild(element);
		}
		return { dispose: () => element.remove() };
	}

	/** Registers floating editor chrome that should count as covering a range during reveal. */
	registerRevealOcclusion(element: Element): IDisposable {
		this._revealOcclusions.add(element);
		return { dispose: () => this._revealOcclusions.delete(element) };
	}

	/**
	 * Temporarily detaches the root {@link EditContext} while focus is inside
	 * nested editor chrome. Chromium otherwise reclaims focus from non-text
	 * controls inside the EditContext host, breaking keyboard access to controls
	 * such as the find actions and read-only toggle.
	 */
	suspendEditContextWhileFocused(element: HTMLElement): IDisposable {
		const onFocusIn = (): void => {
			this._editContextSuspensions.add(element);
			this._syncEditContextAttachment();
		};
		const onFocusOut = (event: FocusEvent): void => {
			const next = event.relatedTarget;
			if (next instanceof Node && element.contains(next)) { return; }
			this._editContextSuspensions.delete(element);
			this._syncEditContextAttachment();
		};
		element.addEventListener('focusin', onFocusIn);
		element.addEventListener('focusout', onFocusOut);
		return {
			dispose: () => {
				element.removeEventListener('focusin', onFocusIn);
				element.removeEventListener('focusout', onFocusOut);
				this._editContextSuspensions.delete(element);
				this._syncEditContextAttachment();
			},
		};
	}

	revealRangeInCenterIfOutsideViewport(range: OffsetRange, behavior: ScrollBehavior = 'smooth'): IDisposable {
		return this._scheduleRangeReveal(range, behavior, 'center');
	}

	/**
	 * Aligns an explicitly navigated range with the top of its nearest vertical
	 * scroll viewport, even when the range is already partially or fully visible.
	 * The alignment leaves {@link TOP_REVEAL_CONTEXT_INSET}px of navigation
	 * context above the range, grown so the range also clears any chrome
	 * registered through {@link registerRevealOcclusion} that covers the top of
	 * that viewport. Outer vertical scrollers and the window keep nearest-edge
	 * behavior so they do not jump, and horizontal scrolling stays nearest-edge.
	 *
	 * Explicit navigation also stops edit-driven caret following, so a later
	 * block resize does not scroll back to where the caret was left behind.
	 * Sticky chrome is remeasured once scrolling completes. User input, a newer
	 * reveal, or disposal cancels that deferred correction.
	 */
	revealRangeAtTop(range: OffsetRange, behavior: ScrollBehavior = 'smooth'): IDisposable {
		this._stopFollowingCaret();
		return this._scheduleRangeReveal(range, behavior, 'top');
	}

	private _scheduleRangeReveal(range: OffsetRange, behavior: ScrollBehavior, alignment: RevealAlignment): IDisposable {
		this._pendingTopReveal?.dispose();
		if (alignment === 'top') { return this._scheduleTopRangeReveal(range, behavior); }
		let disposed = false;
		const raf = requestAnimationFrame(() => {
			if (disposed) { return; }
			this._revealRange(range, behavior, alignment);
		});
		const disposable = {
			dispose: () => {
				if (disposed) { return; }
				disposed = true;
				cancelAnimationFrame(raf);
			},
		};
		return this._register(disposable);
	}

	private _scheduleTopRangeReveal(range: OffsetRange, behavior: ScrollBehavior): IDisposable {
		const doc = this.element.ownerDocument;
		const win = doc.defaultView ?? window;
		const source = this._model.sourceText.get();
		const selection = this._model.selection.get();
		const cancelEvents = ['wheel', 'pointerdown', 'touchstart', 'keydown'];
		let disposed = false;
		let raf: number | undefined;
		let pendingScrolls: Map<EventTarget, ScrollDestination> | undefined;
		const isCurrent = (): boolean => this._model.sourceText.get() === source && this._model.selection.get() === selection;
		const dispose = (): void => {
			if (disposed) { return; }
			disposed = true;
			if (raf !== undefined) { win.cancelAnimationFrame(raf); }
			doc.removeEventListener('scrollend', onScrollEnd, true);
			for (const event of cancelEvents) { doc.removeEventListener(event, dispose, true); }
			pendingScrolls?.clear();
			if (this._pendingTopReveal === disposable) { this._pendingTopReveal = undefined; }
		};
		const correct = (): void => {
			raf = undefined;
			if (disposed) { return; }
			const current = isCurrent();
			dispose();
			if (current) { this._revealRange(range, 'instant', 'top'); }
		};
		const onScrollEnd = (event: Event): void => {
			if (!event.target || !pendingScrolls) { return; }
			const destination = pendingScrolls.get(event.target);
			if (!destination) { return; }
			if (!destination.isReached()) {
				dispose();
				return;
			}
			pendingScrolls.delete(event.target);
			if (pendingScrolls.size === 0) {
				doc.removeEventListener('scrollend', onScrollEnd, true);
				raf = win.requestAnimationFrame(correct);
			}
		};
		const disposable = { dispose };
		this._pendingTopReveal = disposable;
		for (const event of cancelEvents) {
			doc.addEventListener(event, dispose, { capture: true, passive: true });
		}
		raf = win.requestAnimationFrame(() => {
			raf = undefined;
			if (disposed) { return; }
			if (!isCurrent()) {
				dispose();
				return;
			}
			pendingScrolls = this._revealRange(range, behavior, 'top');
			if (!pendingScrolls) {
				dispose();
				return;
			}
			for (const [target, destination] of pendingScrolls) {
				if (destination.isReached()) { pendingScrolls.delete(target); }
			}
			// Wait only for this reveal's actual animations, not unrelated scrolling.
			// Immediate and clamped scrolls need a layout frame, but no scrollend event.
			if (pendingScrolls.size === 0) {
				raf = win.requestAnimationFrame(correct);
			} else {
				doc.addEventListener('scrollend', onScrollEnd, true);
			}
		});
		return disposable;
	}

	/**
	 * Keeps the caret visible after an editor-driven text edit. The reveal is
	 * deferred until the rebuilt document has been laid out and uses nearest-edge
	 * scrolling so ordinary typing only moves the containing viewport as far as
	 * needed. While this mode is active, a later resize of the same active block
	 * also re-reveals the caret (for asynchronous code, math, or diagram layout).
	 */
	revealCaretAfterEdit(): void {
		const selection = this._model.selection.get();
		if (!selection) { return; }
		this._followCaretAfterEdit = true;
		this._scheduleCaretReveal();
	}

	/** Keeps a keyboard-moved caret visible without enabling edit-resize following. */
	revealCaretAfterKeyboardNavigation(): void {
		this._scheduleCaretReveal();
	}

	/** Stops edit-driven caret following before pointer-based selection begins. */
	stopFollowingCaret(): void {
		this._stopFollowingCaret();
	}

	/**
	 * Samples the ambient focus state that decides whether taking focus on open
	 * would steal it from an explicit user target: whether the window is focused
	 * and whether focus is still unclaimed (no active element, or the `<body>`
	 * fallback).
	 */
	private _sampleAutoFocusEnvironment(): AutoFocusEnvironment {
		const doc = this.element.ownerDocument;
		const active = doc.activeElement;
		return {
			windowHasFocus: doc.hasFocus(),
			focusIsUnclaimed: active === null || active === doc.body,
		};
	}

	/**
	 * One-shot guarded focus attempt: focuses the editor only if doing so will
	 * not steal focus from an explicit user target — the window must already be
	 * focused and no other element may have claimed focus yet. Returns whether
	 * focus was taken. A no-op for a background window or when the user has
	 * already focused something else. {@link autoFocusOnOpen} builds the
	 * open-time behavior on top of this primitive.
	 */
	tryAutoFocus(): boolean {
		if (!shouldAutoFocusOnOpen(this._sampleAutoFocusEnvironment())) { return false; }
		this.focus();
		return true;
	}

	/**
	 * Focuses the editor when it opens without ever stealing focus from an
	 * explicit user target. Tries once immediately; if the window is not focused
	 * yet — a common open-time race where the editor is mounted before the host
	 * routes focus to its window — the guarded attempt is deferred to the next
	 * time the window gains focus and re-evaluated then. The deferral is
	 * one-shot, so a later, unrelated window refocus never grabs focus, and the
	 * re-check still respects any target the user has claimed in the meantime.
	 */
	autoFocusOnOpen(): void {
		// Sample the focus state once so the immediate attempt and the deferral
		// decision agree on a single observation of whether the window is focused
		// (both run in this synchronous turn, so the state cannot change between
		// them). The deferred retry re-samples afresh when the window later fires
		// its `focus` event.
		const environment = this._sampleAutoFocusEnvironment();
		if (shouldAutoFocusOnOpen(environment)) {
			this.focus();
			return;
		}
		if (!shouldDeferAutoFocus(environment)) { return; }

		const win = this.element.ownerDocument.defaultView ?? window;
		const onWindowFocus = (): void => {
			win.removeEventListener('focus', onWindowFocus);
			this.tryAutoFocus();
		};
		win.addEventListener('focus', onWindowFocus);
		this._register({ dispose: () => win.removeEventListener('focus', onWindowFocus) });
	}

	/**
	 * Own point→offset resolution. When `true` (the default),
	 * {@link resolveOffsetFromPoint} ignores the platform DOM hit-test
	 * (`caretPositionFromPoint`) and snaps the point to the nearest offset purely
	 * from the rendered {@link VisualLineMap} geometry — picking the nearest
	 * visual line by `y`, then the nearest offset on it by `x`. Because a table
	 * row's cells share one horizontal line band, this makes the whole width of a
	 * row resolve into that row (rather than only the cell boxes), with no visible
	 * layout change. It also lets a drag keep extending toward off-viewport points
	 * (e.g. the pointer leaving the window), which the platform hit-test cannot
	 * resolve. Set to `false` to fall back to the platform DOM hit-test.
	 */
	public readonly geometricHitTest = observableValue<boolean>(this, true);

	/**
	 * Client coordinates → absolute source offset (any block). Used during
	 * drag to keep extending the selection even when the pointer leaves the
	 * original block. Honours {@link geometricHitTest}.
	 */
	resolveOffsetFromPoint(point: Point2D): SourceOffset | undefined {
		const hit = document.elementFromPoint(point.x, point.y);
		const videoOffset = this._resolveControlFreeVideoOffset(hit);
		if (videoOffset !== undefined) { return videoOffset; }
		const tableCellOffset = this._resolveTableCellOffset(point, hit);
		if (tableCellOffset !== undefined) { return tableCellOffset; }
		if (this.geometricHitTest.get()) {
			return this.resolveCursorHit(point)?.offset;
		}
		const pos = caretDomPositionFromPoint(point);
		if (!pos) { return undefined; }
		return this._document.get()?.resolveSource(pos);
	}

	/**
	 * Client point → source offset, plus whether the caret should sit on the
	 * right edge of a newline glyph (`upstream`) or at the next line (`downstream`).
	 */
	resolveCursorHit(point: Point2D): { readonly offset: SourceOffset; readonly affinity: 'upstream' | 'downstream' } | undefined {
		const hit = document.elementFromPoint(point.x, point.y);
		const videoOffset = this._resolveControlFreeVideoOffset(hit);
		if (videoOffset !== undefined) { return { offset: videoOffset, affinity: 'downstream' }; }
		const tableCellOffset = this._resolveTableCellOffset(point, hit);
		if (tableCellOffset !== undefined) { return { offset: tableCellOffset, affinity: 'downstream' }; }
		if (!this.geometricHitTest.get()) {
			const offset = this.resolveOffsetFromPoint(point);
			return offset === undefined ? undefined : { offset, affinity: 'downstream' };
		}
		const map = this.measuredLayout.visualLineMap.get();
		if (map.isEmpty) { return undefined; }
		const local = this.coordinateSpace.capture().toLocalPoint(point);
		const lineIndex = map.lineIndexAtY(local.y);
		const offset = map.offsetInLineAtX(lineIndex, local.x);
		const affinity = map.lineEndsAtWideNewlineGlyph(lineIndex, offset) ? 'upstream' : 'downstream';
		return { offset, affinity };
	}

	private _resolveControlFreeVideoOffset(hit: Element | null): SourceOffset | undefined {
		const video = hit?.closest('video.md-video');
		if (!(video instanceof HTMLVideoElement) || video.controls || !this._contentContainer.contains(video)) {
			return undefined;
		}
		const documentView = this._document.get();
		if (!documentView) { return undefined; }
		const videoNode = ViewNode.forDom(video);
		if (
			!(videoNode?.ast instanceof VideoAstNode)
			|| !(videoNode.dom instanceof HTMLElement)
			|| !videoNode.dom.contains(video)
		) {
			return undefined;
		}
		const videoStart = documentView.resolveSource({ node: video, offset: 0 });
		if (videoStart === undefined) { return undefined; }
		return videoStart + (videoNode.ast.leadingTrivia?.length ?? 0);
	}

	/**
	 * Resolve table-cell hits that have no measurable text run. Empty cells map
	 * from their own box instead of snapping to a neighboring cell; element-only
	 * content (for example an inactive image) maps through the hit element's view
	 * node. Text-bearing cells keep the normal pixel-precise line-map/DOM path.
	 */
	private _resolveTableCellOffset(point: Point2D, hit: Element | null): SourceOffset | undefined {
		const cell = hit?.closest('td');
		if (!(cell instanceof HTMLTableCellElement) || !this._contentContainer.contains(cell)) {
			return undefined;
		}
		const documentView = this._document.get();
		if (!documentView) { return undefined; }
		const cellNode = ViewNode.forDom(cell);
		if (cellNode?.ast.kind !== 'tableCell' || cellNode.dom !== cell) {
			return undefined;
		}
		const cellStart = documentView.resolveSource({ node: cell, offset: 0 });
		const cellEnd = documentView.resolveSource({ node: cell, offset: 1 });
		if (cellStart === undefined || cellEnd === undefined) { return undefined; }

		const domOffsetAtPoint = (element: Element): 0 | 1 => {
			const rect = element.getBoundingClientRect();
			const isRtl = getComputedStyle(element).direction === 'rtl';
			const onStartSide = isRtl ? point.x >= rect.left + rect.width / 2 : point.x < rect.left + rect.width / 2;
			return onStartSide ? 0 : 1;
		};

		const hasSourceRun = (start: SourceOffset, end: SourceOffset): boolean =>
			this.measuredLayout.visualLineMap.get().lines.some(line =>
				line.runs.some(run =>
					run.source !== undefined
					&& run.sourceStart < end
					&& run.sourceEndExclusive > start
				)
			);

		const hitNode = hit ? ViewNode.forDom(hit) : undefined;
		if (hitNode && hitNode !== cellNode && hitNode.dom instanceof Element) {
			const hitStart = documentView.resolveSource({ node: hitNode.dom, offset: 0 });
			const hitEnd = documentView.resolveSource({ node: hitNode.dom, offset: 1 });
			if (hitStart !== undefined && hitEnd !== undefined && !hasSourceRun(hitStart, hitEnd)) {
				if (hitEnd - hitStart <= 1) { return hitEnd; }
				return domOffsetAtPoint(hitNode.dom) === 0 ? hitStart + 1 : hitEnd - 1;
			}
		}

		if (hasSourceRun(cellStart, cellEnd)) { return undefined; }
		if (cellEnd - cellStart <= 1) { return cellEnd; }
		return domOffsetAtPoint(cell) === 0 ? cellStart + 1 : cellEnd - 1;
	}

	/**
	 * Whether a client point falls on the rendered document content, as
	 * opposed to the surrounding editor padding (the green area). Uses DOM
	 * containment rather than the content node's bounding box so that markers
	 * which overflow into the padding (e.g. a heading's `##`, which renders in
	 * the left margin) still count as content. Overlays (cursor, selection)
	 * have `pointer-events: none`, so the hit-test sees through them.
	 */
	isPointInContent(point: Point2D): boolean {
		const content = this._document.get()?.contentDomNode;
		if (!content) { return false; }
		const hit = document.elementFromPoint(point.x, point.y);
		return hit !== null && content.contains(hit);
	}

	/**
	 * Whether `range` intersects the rendered source text — the region whose
	 * selection this editor paints itself from `model.selection`. This also
	 * catches select-all ranges whose endpoints surround the rendered content.
	 * Overlays anchored beside the text (comment widgets and the like) are *not*
	 * part of it and keep their own native selection behaviour.
	 */
	intersectsRenderedContent(range: Range): boolean {
		const content = this._document.get()?.contentDomNode;
		return !!content && range.intersectsNode(content);
	}

	// ----- render autorun ------------------------------------------------

	private readonly _renderAutorun = (reader: IReader): void => {
		const doc = reader.readObservable(this._model.document);
		const sourceText = reader.readObservable(this._model.sourceText).value;
		const modelMarkerVisibleBlocks = reader.readObservable(this._model.markerVisibleBlocks);
		const forcedMarkerVisibleBlocks = reader.readObservable(this.forcedMarkerVisibleBlocks);
		const markerVisibleBlocks = forcedMarkerVisibleBlocks.size === 0
			? modelMarkerVisibleBlocks
			: new Set([...modelMarkerVisibleBlocks, ...forcedMarkerVisibleBlocks]);
		const selection = reader.readObservable(this._model.selection);
		const pending = reader.readObservable(this._model.pendingParagraph);
		const diff = reader.readObservable(this._model.diff);
		const readonly = reader.readObservable(this._model.readonlyMode);
		const embeddedCodeEditorFactoryVersion = reader.readObservable(this._embeddedCodeEditorFactoryVersion);

		if (this.editContext.text !== sourceText) {
			this.editContext.updateText(0, this.editContext.text.length, sourceText);
		}
		const selectionRange = selection?.range;
		this.editContext.updateSelection(selectionRange?.start ?? 0, selectionRange?.endExclusive ?? 0);

		// Rebuild the document node, reusing the previous one's blocks where
		// the AST identity and render inputs are unchanged. The parser
		// preserves block objects across reparses (see {@link MarkdownParser.parse}),
		// so a matching `Block` reference means the rendered DOM is still valid.
		const previous = this._document.get();
		// Overlay the AST with the selection-derived flags, reusing the previous
		// frame's view-data for any unchanged subtree so the rebuild below collapses
		// to a single identity check per node (see {@link buildDocumentViewData}).
		const baseViewData = buildDocumentViewData(
			doc, markerVisibleBlocks,
			selection?.range, this._previousViewData,
			pending ? {
				anchorBlock: pending.anchorBlock,
				ast: pending.syntheticAst,
				replaceRange: pending.replaceRange,
				cursorLine: pending.cursorLine,
				text: pending.text,
			} : undefined,
		);
		this._previousViewData = baseViewData;
		const viewData = diff ? applyDiffDecorations(baseViewData, diff.items, this._options?.diffDecorationsActive) : baseViewData;
		this._viewData.set(viewData, undefined);
		const options: BlockViewOptions = {
			...this._options,
			suspendEditContextWhileFocused: this._suspendEditContextForBlockControl,
			...(this._options?.embeddedCodeEditorFactory
				? { embeddedCodeEditorReadOnly: readonly, embeddedCodeEditorFactoryVersion }
				: {}),
		};
		const documentNode = DocumentViewNode.create(viewData, options, previous);
		if (previous) {
			// The content element is stable across rebuilds, so once mounted it
			// never moves.
			if (documentNode.contentDomNode !== previous.contentDomNode) {
				throw new Error('DocumentViewNode.contentDomNode must be stable across rebuilds');
			}
		} else {
			// First render: mount the freshly-created content element ahead of
			// the selection/cursor overlays, preserving any leading view chrome.
			this._contentContainer.insertBefore(documentNode.contentDomNode, this._selectionView.element);
			this._resizeObserver.observe(documentNode.contentDomNode);
		}
		this._document.set(documentNode, undefined);
		this._publishMeasurements(documentNode);

		if (diff) { this._paintDiff(documentNode, diff.insertedRanges); }
		else { this._clearDiff(); }
	};

	/** Current mounted blocks, or empty before the first render. */
	private get _blocks(): readonly DocumentBlock[] {
		return this._document.get()?.blocks ?? [];
	}

	/**
	 * Measure each mounted block's rect and per-block visual line map, then
	 * publish the result into the {@link MeasuredLayoutModel}. The model
	 * is not read here, so there is no feedback loop into the render autorun.
	 */
	private _publishMeasurements(document: DocumentViewNode): void {
		const transform = this.coordinateSpace.capture();
		const measurements: BlockMeasurement[] = [];
		for (const entry of document.blocks) {
			const blockRect = transform.toLocalRect(entry.node.element.getBoundingClientRect());
			// Let the block remember its own measured height (a math block reserves
			// its rendered height to keep the layout stable across the active toggle).
			entry.node.recordMeasuredHeight(blockRect.height);
			const scrollElement = entry.node.scrollElement;
			let viewportClip: { readonly left: number; readonly right: number } | undefined;
			const overflowX = getComputedStyle(scrollElement).overflowX;
			const clipsOverflowX = overflowX === 'auto'
				|| overflowX === 'scroll'
				|| overflowX === 'hidden'
				|| overflowX === 'clip';
			if (clipsOverflowX && scrollElement.scrollWidth > scrollElement.clientWidth + 1) {
				const scrollRect = transform.toLocalRect(scrollElement.getBoundingClientRect());
				const left = scrollRect.left + scrollElement.clientLeft;
				viewportClip = { left, right: left + scrollElement.clientWidth };
			}
			const visualLineMap = VisualLineMap.measure([{
				absoluteStart: entry.absoluteStart,
				viewNode: entry.node,
			}], this.coordinateSpace, transform);
			measurements.push({
				block: entry.node.block,
				absoluteStart: entry.absoluteStart,
				height: blockRect.height,
				rect: blockRect,
				viewportClip,
				isMeasured: true,
				visualLineMap,
				viewNode: entry.node,
			});
		}
		const pending = document.pendingParagraph;
		const virtualLines: VirtualLineMeasurement[] = [];
		if (pending) {
			const rect = transform.toLocalRect(pending.element.getBoundingClientRect());
			const caretRect = transform.toLocalRect(pending.getCaretClientRect());
			virtualLines.push({
				afterBlock: pending.anchorBlock,
				line: VisualLine.virtual(
					pending.cursorLine,
					Rect2D.fromPointSize(caretRect.left, rect.top, 0, rect.height),
				),
			});
		}
		this.measuredLayout.setMeasurements(measurements, virtualLines);
	}

	/**
	 * Paint the diff highlights via the CSS Custom Highlight API: green over the
	 * inserted/changed modified ranges (mapped on the document's own DOM), and
	 * red over each {@link DiffDecorationViewNode}'s deleted ranges (mapped on
	 * the decoration's own subtree). No DOM is mutated, so reconciliation and
	 * editing are unaffected.
	 */
	private _paintDiff(documentNode: DocumentViewNode, insertedRanges: readonly OffsetRange[]): void {
		this._diffHighlightsView.render(documentNode, insertedRanges);
	}

	private _clearDiff(): void {
		this._diffHighlightsView.clear();
	}

	private _syncEditContextAttachment(): void {
		this.element.editContext = this._editContextSuspensions.size > 0 ? null : this.editContext;
	}

	private _revealRange(
		range: OffsetRange,
		behavior: ScrollBehavior,
		alignment: RevealAlignment = 'center',
		verticalContextLineHeight?: number,
	): Map<EventTarget, ScrollDestination> | undefined {
		const documentNode = this._document.get();
		if (!documentNode) { return; }
		const mapped = mappedRangesForOffsets(documentNode, [range]);
		if (mapped.length === 0 && !range.isEmpty) { return; }

		const measurement = this.measuredLayout.measurements.get().find(value =>
			value.absoluteStart <= range.start
			&& range.start <= value.absoluteStart + value.block.length
		);
		const anchorNode = mapped[0]?.range.startContainer ?? measurement?.viewNode?.dom;
		const anchor = anchorNode instanceof Element
			? anchorNode
			: anchorNode?.parentElement;
		if (!anchor) { return; }

		const resolveTargetRect = (): Rect2D | undefined => {
			const mappedRect = boundingClientRect(mapped.flatMap(entry => Array.from(entry.range.getClientRects())));
			if (mappedRect || !range.isEmpty) { return mappedRect; }
			const visualLineMap = this.measuredLayout.visualLineMap.get();
			if (!visualLineMap.isEmpty) {
				const lineIndex = visualLineMap.lineIndexOfOffset(range.start);
				const lineRect = visualLineMap.lineRect(lineIndex);
				const localRect = Rect2D.fromPointSize(
					visualLineMap.xAtOffset(range.start),
					lineRect.top,
					2,
					lineRect.height,
				);
				return this.coordinateSpace.capture().toClientRect(localRect);
			}
			if (measurement?.rect) {
				return this.coordinateSpace.capture().toClientRect(
					Rect2D.fromPointSize(measurement.rect.left, measurement.rect.top, 2, measurement.rect.height),
				);
			}
			return undefined;
		};
		return this._revealTarget(anchor, resolveTargetRect, behavior, alignment, verticalContextLineHeight);
	}

	private _revealTarget(
		anchor: Element,
		resolveTargetRect: () => Rect2D | undefined,
		behavior: ScrollBehavior,
		alignment: RevealAlignment,
		verticalContextLineHeight?: number,
	): Map<EventTarget, ScrollDestination> | undefined {
		let targetRect = resolveTargetRect();
		if (!targetRect) { return; }
		const visibleRect = getClippingClientRect(anchor);
		let occluded = this._isRevealOccluded(targetRect);
		if (
			alignment !== 'top'
			&& clientRectContains(visibleRect, withVerticalContext(targetRect, visibleRect, verticalContextLineHeight))
			&& !occluded
		) { return; }

		const scrollableAncestors = getScrollableAncestors(anchor);
		const scrollDestinations = alignment === 'top' ? new Map<EventTarget, ScrollDestination>() : undefined;
		// Top alignment applies to the nearest vertical scroller only; every other
		// scroller (and the window) keeps nearest-edge behavior so it does not jump.
		const nearestVerticalScroller = alignment === 'top'
			? scrollableAncestors.find(value => elementScrollsContentVertically(value))
			: undefined;
		for (let index = 0; index < scrollableAncestors.length; index++) {
			const scrollable = scrollableAncestors[index];
			targetRect = resolveTargetRect() ?? targetRect;
			occluded = this._isRevealOccluded(targetRect);
			const viewport = getElementClientRect(scrollable);
			const revealRect = withVerticalContext(targetRect, viewport, verticalContextLineHeight);
			const scrollsX = scrollable.scrollWidth > scrollable.clientWidth;
			const scrollsY = scrollable.scrollHeight > scrollable.clientHeight;
			const alignsTop = scrollable === nearestVerticalScroller;
			const scrollableAlignment = alignment === 'top' && !alignsTop ? 'nearest' : alignment;
			const topInset = alignsTop ? this._topRevealInset(viewport, targetRect) : TOP_REVEAL_CONTEXT_INSET;
			// Outer scrollers still move nearest-edge, but against a viewport that
			// excludes registered top chrome, so they cannot undo the alignment by
			// parking the target behind it.
			const moveViewport = alignment === 'top' && !alignsTop
				? this._unoccludedViewport(viewport, targetRect)
				: viewport;
			const gateViewport = withNearestGateTolerance(moveViewport, viewport);
			const clientDelta = revealDelta(revealRect, moveViewport, scrollableAlignment, topInset);
			const delta = clientDeltaToScrollDelta(scrollable, clientDelta.x, clientDelta.y);
			const nextLeft = scrollsX && (targetRect.left < viewport.left || targetRect.right > viewport.right)
				? scrollable.scrollLeft + delta.x
				: scrollable.scrollLeft;
			const nextTop = scrollsY && (alignsTop || revealRect.top < gateViewport.top || revealRect.bottom > gateViewport.bottom || occluded)
				? scrollable.scrollTop + delta.y
				: scrollable.scrollTop;
			const scrollsVertically = nextTop !== scrollable.scrollTop;
			if (nextLeft !== scrollable.scrollLeft || scrollsVertically) {
				const destination = scrollDestinations ? getElementScrollDestination(scrollable, nextLeft, nextTop) : undefined;
				scrollable.scrollTo({
					left: nextLeft,
					top: nextTop,
					behavior: alignment === 'top' && behavior === 'instant' ? 'instant' : 'auto',
				});
				if (destination) { scrollDestinations?.set(destination.eventTarget, destination); }
			}
		}

		targetRect = resolveTargetRect() ?? targetRect;
		occluded = this._isRevealOccluded(targetRect);
		const doc = this.element.ownerDocument;
		const win = doc.defaultView ?? window;
		const viewport = Rect2D.fromPointSize(
			0,
			0,
			doc.documentElement.clientWidth || win.innerWidth,
			doc.documentElement.clientHeight || win.innerHeight,
		);
		const revealRect = withVerticalContext(targetRect, viewport, verticalContextLineHeight);
		// Once an inner scroller has aligned the target, the window only closes any
		// remaining gap on the nearest edge.
		const windowAlignment = alignment === 'top' && nearestVerticalScroller !== undefined ? 'nearest' : alignment;
		const alignsWindowTop = windowAlignment === 'top';
		const windowViewport = alignment === 'top' && !alignsWindowTop
			? this._unoccludedViewport(viewport, targetRect)
			: viewport;
		if (alignsWindowTop || !clientRectContains(withNearestGateTolerance(windowViewport, viewport), revealRect) || occluded) {
			const topInset = alignsWindowTop ? this._topRevealInset(viewport, targetRect) : TOP_REVEAL_CONTEXT_INSET;
			const delta = revealDelta(revealRect, windowViewport, windowAlignment, topInset);
			const left = targetRect.left < viewport.left || targetRect.right > viewport.right ? delta.x : 0;
			if (scrollDestinations) {
				scrollDestinations.set(doc, getWindowScrollDestination(win, win.scrollX + left, win.scrollY + delta.y));
			}
			win.scrollBy({
				left,
				top: delta.y,
				behavior,
			});
		}
		return scrollDestinations;
	}

	private _scheduleCaretReveal(): void {
		if (this._caretRevealRaf !== undefined) {
			cancelAnimationFrame(this._caretRevealRaf);
		}
		this._caretRevealRaf = requestAnimationFrame(() => {
			this._caretRevealRaf = requestAnimationFrame(() => {
				this._caretRevealRaf = undefined;
				const selection = this._model.selection.get();
				if (!selection || !this._focused.get()) { return; }
				this._revealCaretNearest();
				this._followedCaretBlock = this._caretBlockAt(selection.active);
			});
		});
	}

	private _revealCaretNearest(): void {
		const position = this._model.cursorPosition.get();
		if (!position) { return; }
		const visualLineMap = this.measuredLayout.visualLineMap.get();
		const lineIndex = visualLineMap.lineIndexOfPosition(position);
		const lineHeight = lineIndex === undefined
			? undefined
			: visualLineMap.lineRect(lineIndex).height;
		if (position.kind === 'source') {
			this._revealRange(OffsetRange.emptyAt(position.offset), 'auto', 'nearest', lineHeight);
			return;
		}

		const rendering = this._cursorView.rendering.get();
		const selection = this._model.selection.get();
		const measurement = selection ? this._measurementAt(selection.active) : undefined;
		const anchor = measurement?.viewNode?.dom;
		const anchorElement = anchor instanceof Element ? anchor : anchor?.parentElement;
		if (!rendering.visible || !anchorElement) { return; }
		this._revealTarget(
			anchorElement,
			() => {
				const current = this._cursorView.rendering.get();
				return current.visible
					? this.coordinateSpace.capture().toClientRect(current.rect)
					: undefined;
			},
			'auto',
			'nearest',
			lineHeight,
		);
	}

	private _revealCaretAfterActiveBlockResize(): void {
		if (!this._followCaretAfterEdit) { return; }
		const selection = this._model.selection.get();
		if (!selection) { return; }
		const current = this._caretBlockAt(selection.active);
		const previous = this._followedCaretBlock;
		if (!current) {
			this._followedCaretBlock = undefined;
			return;
		}
		if (
			previous
			&& (
				previous.element !== current.element
				|| Math.abs(previous.height - current.height) >= 0.5
			)
		) {
			this._scheduleCaretReveal();
		}
		this._followedCaretBlock = current;
	}

	private _caretBlockAt(offset: SourceOffset): { readonly element: HTMLElement; readonly height: number } | undefined {
		const measurement = this._measurementAt(offset);
		return measurement?.viewNode
			? { element: measurement.viewNode.element, height: measurement.height }
			: undefined;
	}

	private _measurementAt(offset: SourceOffset): BlockMeasurement | undefined {
		return this.measuredLayout.measurements.get().find(value =>
			value.absoluteStart <= offset
			&& offset <= value.absoluteStart + value.block.length
			&& value.viewNode !== undefined
		);
	}

	private _stopFollowingCaret(): void {
		this._followCaretAfterEdit = false;
		this._followedCaretBlock = undefined;
		if (this._caretRevealRaf !== undefined) {
			cancelAnimationFrame(this._caretRevealRaf);
			this._caretRevealRaf = undefined;
		}
	}

	private _isRevealOccluded(rect: Rect2D): boolean {
		for (const occlusion of this._activeRevealOcclusions()) {
			if (clientRectIntersectsIncludingEmpty(rect, occlusion)) { return true; }
		}
		return false;
	}

	/** Client rects of registered occlusions that are currently rendered and visible. */
	private *_activeRevealOcclusions(): Iterable<Rect2D> {
		for (const element of this._revealOcclusions) {
			const win = element.ownerDocument.defaultView;
			const visibility = win?.getComputedStyle(element).visibility;
			if (
				element.isConnected
				&& element.getClientRects().length > 0
				&& visibility !== 'hidden'
				&& visibility !== 'collapse'
			) {
				yield rectFromDom(element.getBoundingClientRect());
			}
		}
	}

	/**
	 * How far registered chrome covers the top of `viewport`, measured down from
	 * `viewport.top`, across the columns `target` occupies. Clearing one occluder
	 * can slide the target behind the next one, so the tested band is re-evaluated
	 * until it settles; stacked chrome therefore reports the lowest connected
	 * bottom edge. Returns 0 when nothing covers the top.
	 */
	private _occludedTopHeight(viewport: Rect2D, target: Rect2D): number {
		let height = 0;
		// Every pass clears at least one more occluder, so the count bounds it.
		for (let pass = 0; pass <= this._revealOcclusions.size; pass++) {
			const band = Rect2D.fromPointPoint(
				target.left,
				viewport.top,
				target.right,
				viewport.top + height + TOP_REVEAL_CONTEXT_INSET + target.height,
			);
			let next = height;
			for (const occlusion of this._activeRevealOcclusions()) {
				if (!clientRectIntersectsIncludingEmpty(band, occlusion)) { continue; }
				next = Math.max(next, occlusion.bottom - viewport.top);
			}
			if (next === height) { break; }
			height = next;
		}
		return height;
	}

	/**
	 * Vertical inset used to top-align `target` inside `viewport`. Defaults to
	 * {@link TOP_REVEAL_CONTEXT_INSET}, and grows past registered chrome covering
	 * the viewport top so the same breathing room is kept below that chrome.
	 */
	private _topRevealInset(viewport: Rect2D, target: Rect2D): number {
		const occludedTop = this._occludedTopHeight(viewport, target);
		// Chrome covering most of the viewport must not push the target out of it,
		// but the cap still may not pull the target back behind that chrome, and
		// never below the baseline inset.
		const maxInset = Math.max(TOP_REVEAL_CONTEXT_INSET, occludedTop, viewport.height - target.height);
		return Math.min(occludedTop + TOP_REVEAL_CONTEXT_INSET, maxInset);
	}

	/**
	 * `viewport` reduced to the area an explicitly navigated target may occupy:
	 * registered top chrome is excluded, along with the breathing room below it.
	 * Nearest-edge movement parks the target just inside the rect it is given, so
	 * the inset has to be part of that rect; otherwise an outer scroller, or the
	 * window, would leave the target grazing the chrome's bottom edge after the
	 * nearest vertical viewport had already aligned it.
	 */
	private _unoccludedViewport(viewport: Rect2D, target: Rect2D): Rect2D {
		const occludedTop = this._occludedTopHeight(viewport, target);
		if (occludedTop <= 0) { return viewport; }
		const safeTop = viewport.top + occludedTop + TOP_REVEAL_CONTEXT_INSET;
		// Chrome covering the viewport leaves nothing to reduce it to.
		if (safeTop >= viewport.bottom) { return viewport; }
		return Rect2D.fromPointPoint(
			viewport.left,
			safeTop,
			viewport.right,
			viewport.bottom,
		);
	}
}

function clientRectIntersectsIncludingEmpty(value: Rect2D, occlusion: Rect2D): boolean {
	const intersectsX = value.width === 0
		? occlusion.containsX(value.left)
		: Math.max(value.left, occlusion.left) < Math.min(value.right, occlusion.right);
	const intersectsY = value.height === 0
		? occlusion.containsY(value.top)
		: Math.max(value.top, occlusion.top) < Math.min(value.bottom, occlusion.bottom);
	return intersectsX && intersectsY;
}

function boundingClientRect(rects: readonly DOMRect[]): Rect2D | undefined {
	if (rects.length === 0) { return undefined; }
	let left = Number.POSITIVE_INFINITY;
	let top = Number.POSITIVE_INFINITY;
	let right = Number.NEGATIVE_INFINITY;
	let bottom = Number.NEGATIVE_INFINITY;
	for (const rect of rects) {
		left = Math.min(left, rect.left);
		top = Math.min(top, rect.top);
		right = Math.max(right, rect.right);
		bottom = Math.max(bottom, rect.bottom);
	}
	return Rect2D.fromPointPoint(left, top, right, bottom);
}

function rectFromDom(rect: Pick<DOMRectReadOnly, 'left' | 'top' | 'right' | 'bottom'>): Rect2D {
	return Rect2D.fromPointPoint(rect.left, rect.top, rect.right, rect.bottom);
}

/**
 * Boundary used to decide whether a nearest-edge scroller still has work to do.
 * Nearest movement parks the target {@link NEAREST_REVEAL_MARGIN} inside the
 * rect it aims at, and scroll offsets snap to whole pixels, so a target already
 * sitting at that boundary must count as satisfied. Without the tolerance an
 * occlusion-reduced viewport would nudge the scroller on every reveal.
 * Returns `viewport` untouched when it was not reduced, keeping the centered
 * and plain nearest reveal paths byte-for-byte unchanged.
 */
function withNearestGateTolerance(moveViewport: Rect2D, viewport: Rect2D): Rect2D {
	if (moveViewport === viewport) { return viewport; }
	return Rect2D.fromPointPoint(
		moveViewport.left,
		moveViewport.top - NEAREST_REVEAL_MARGIN,
		moveViewport.right,
		moveViewport.bottom,
	);
}

function revealDelta(
	target: Rect2D,
	viewport: Rect2D,
	alignment: RevealAlignment,
	topInset: number = TOP_REVEAL_CONTEXT_INSET,
): Point2D {
	if (alignment === 'center') {
		return new Point2D(
			target.left + target.width / 2 - (viewport.left + viewport.width / 2),
			target.top + target.height / 2 - (viewport.top + viewport.height / 2),
		);
	}
	const horizontalDelta = target.left < viewport.left
		? target.left - viewport.left - NEAREST_REVEAL_MARGIN
		: target.right > viewport.right
			? target.right - viewport.right + NEAREST_REVEAL_MARGIN
			: 0;
	if (alignment === 'top') {
		return new Point2D(horizontalDelta, target.top - viewport.top - topInset);
	}
	const verticalDelta = target.height > viewport.height
		? target.top - viewport.top
		: target.top < viewport.top
			? target.top - viewport.top - NEAREST_REVEAL_MARGIN
			: target.bottom > viewport.bottom
				? target.bottom - viewport.bottom + NEAREST_REVEAL_MARGIN
				: 0;
	return new Point2D(horizontalDelta, verticalDelta);
}

function withVerticalContext(target: Rect2D, viewport: Rect2D, lineHeight: number | undefined): Rect2D {
	if (lineHeight === undefined || lineHeight <= 0) { return target; }
	const linesInViewport = viewport.height / lineHeight;
	const contextLines = Math.min(linesInViewport / 2, CARET_SURROUNDING_LINES);
	const padding = contextLines * lineHeight;
	return Rect2D.fromPointPoint(
		target.left,
		target.top - padding,
		target.right,
		target.bottom + padding,
	);
}
