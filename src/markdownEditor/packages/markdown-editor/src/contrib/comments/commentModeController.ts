import { Disposable, autorun, type IReader } from '@vscode/observables';
import { OffsetRange } from '../../core/offsetRange.js';
import { Rect2D } from '../../core/geometry.js';
import type { EditorModel, SelectionSource } from '../../model/editorModel.js';
import type { EditorView } from '../../view/editorView.js';
import { CommentInputWidget } from './commentInputWidget.js';

/** A comment the user submitted, with the source range it was anchored to. */
export interface CommentSubmission {
	readonly text: string;
	readonly range: OffsetRange;
}

export interface CommentModeControllerOptions {
	/** Called when the user submits a comment for the current selection. */
	readonly onSubmit?: (submission: CommentSubmission) => void;
	/** Gap (px) between the bottom of the selection and the top of the input box. */
	readonly gap?: number;
}

/**
 * Comment mode — a compact "add a comment" affordance layered on top of
 * the editor *without modifying it*. It reads the editor's public observables
 * ({@link EditorModel.readonlyMode}, {@link EditorModel.selection}) and the
 * exposed {@link EditorView.caretRect} geometry, and mounts a
 * {@link CommentInputWidget} into {@link EditorView.overlayContainer}.
 *
 * Behaviour:
 *  - Only active in read-only mode (the "review" view).
 *  - When a user-created selection is non-empty, the input box appears next to
 *    the caret (the selection's active end) but does NOT take focus, so keyboard
 *    selection keeps working. Programmatic selections such as find matches do
 *    not summon it. Press Tab to move focus into the box, then type.
 *  - The box appears on mouse-up, not mid-drag, so it doesn't flicker/jump
 *    while a selection is being dragged out (keyboard selection shows at once).
 *  - While the box has focus or holds a draft it is frozen in place (selection
 *    changes, drags and clicks no longer move it). It is dismissed by Escape,
 *    by submitting, or by blurring an empty box.
 *  - The editor's logical caret geometry remains available for anchoring in
 *    read-only mode even though the painted caret is hidden. While the box has
 *    focus, `.md-comment-active` also suppresses the painted caret in any mode.
 */
export class CommentModeController extends Disposable {
	private static _isCommentableSelectionSource(source: SelectionSource): boolean {
		switch (source) {
			case 'user': return true;
			case 'find': return false;
			default: return assertNever(source);
		}
	}

	private readonly _widget: CommentInputWidget;
	private readonly _gap: number;
	private _visible = false;
	private _anchorX = 0;
	private _pinnedRange: OffsetRange | undefined;
	/**
	 * The range a comment was just submitted for. The box stays hidden for it
	 * until the selection changes, so submitting doesn't immediately re-summon an
	 * empty box on the still-selected text.
	 */
	private _submittedRange: OffsetRange | undefined;

	constructor(
		private readonly _model: EditorModel,
		private readonly _view: EditorView,
		private readonly _options?: CommentModeControllerOptions,
	) {
		super();
		this._gap = _options?.gap ?? 8;

		this._widget = this._register(new CommentInputWidget({
			onDidChangeSize: () => {
				if (this._visible) {
					this._layoutHorizontally();
				}
			},
			onSubmit: text => this._submit(text),
			onCancel: () => this._hideAndRefocus(),
		}));
		const el = this._widget.element;
		el.style.position = 'absolute';
		el.style.zIndex = '20';
		el.style.display = 'none';
		this._view.overlayContainer.appendChild(el);
		this._register({ dispose: () => el.remove() });
		this._register({ dispose: () => this._view.element.classList.remove('md-comment-active') });

		const resizeObserver = new ResizeObserver(() => {
			if (this._visible) {
				this._layoutHorizontally();
			}
		});
		resizeObserver.observe(el);
		resizeObserver.observe(this._view.overlayContainer);
		this._register({ dispose: () => resizeObserver.disconnect() });

		this._register(autorun(reader => this._update(reader)));

		const doc = this._view.element.ownerDocument;

		// Suppress the editor's painted caret while focus belongs to the comment
		// input. Read-only mode already hides it visually without removing the
		// geometry this controller uses for anchoring.
		const onFocus = (): void => { this._view.element.classList.add('md-comment-active'); };
		this._widget.inputElement.addEventListener('focus', onFocus);
		this._register({ dispose: () => this._widget.inputElement.removeEventListener('focus', onFocus) });

		// Dismiss an empty box once focus leaves it (e.g. a click elsewhere). A
		// non-empty draft is preserved, and a focused box is never hidden — see
		// `_autoHide`. Deferred so focus has settled before we decide.
		const onBlur = (): void => {
			this._view.element.classList.remove('md-comment-active');
			doc.defaultView?.setTimeout(() => this._autoHide(), 0);
		};
		this._widget.inputElement.addEventListener('blur', onBlur);
		this._register({ dispose: () => this._widget.inputElement.removeEventListener('blur', onBlur) });

		// Tab moves focus from the document into the visible box, so the user can
		// select with the keyboard first and then press Tab to start typing. The
		// editor itself does not handle Tab, so a plain bubble listener suffices.
		const onKeyDown = (e: KeyboardEvent): void => {
			if (e.key !== 'Tab' || e.shiftKey || e.ctrlKey || e.metaKey || e.altKey) { return; }
			if (!this._visible || this._widgetHasFocus()) { return; }
			e.preventDefault();
			this._widget.focus();
		};
		this._view.element.addEventListener('keydown', onKeyDown);
		this._register({ dispose: () => this._view.element.removeEventListener('keydown', onKeyDown) });
	}

	private _update(reader: IReader): void {
		const readonly = this._model.readonlyMode.read(reader);
		const selection = this._model.selection.read(reader);
		const selectionSource = this._model.selectionSource.read(reader);
		const caretRect = this._view.caretRect.read(reader);
		const isSelecting = this._model.isSelecting.read(reader);
		const hasTypedText = this._widget.value.read(reader).trim().length > 0;

		// Leaving read-only mode tears the box down unconditionally.
		if (!readonly) {
			this._hide();
			return;
		}

		// Find selects matches for navigation, not because the user chose a range
		// to review. Keep comment mode tied to explicit pointer/keyboard selection.
		if (!CommentModeController._isCommentableSelectionSource(selectionSource)) {
			this._autoHide();
			return;
		}

		// Freeze the box while the user is engaged with it — it has focus or a
		// draft — so selection changes, drags and clicks no longer move or hide it.
		// They dismiss it via Escape, submit, or by clicking away.
		if (this._visible && (hasTypedText || this._widgetHasFocus())) {
			return;
		}

		// Don't react while a selection drag is in progress: wait for it to end so
		// the box doesn't flicker/jump while a selection is dragged out.
		if (isSelecting) {
			this._autoHide();
			return;
		}

		if (!selection || selection.isCollapsed || !caretRect) {
			this._autoHide();
			return;
		}

		// Don't re-show the box for a range we just commented on; keep it hidden
		// until the user selects something else (then this suppression is cleared).
		if (this._submittedRange?.equals(selection.range)) {
			this._autoHide();
			return;
		}
		this._submittedRange = undefined;

		// Anchor to the active end of the selection (where the caret is). A forward
		// selection's caret sits at the bottom — place the box below it; a backward
		// selection's caret sits at the top — place it above. This keeps the box next
		// to the user's cursor regardless of how large the selection is.
		this._pinnedRange = selection.range;
		this._show(caretRect, /* preferAbove */ !selection.isForward);
	}

	private _show(caretRect: Rect2D, preferAbove: boolean): void {
		const el = this._widget.element;

		// Reveal before measuring so offset dimensions are valid.
		el.style.display = '';
		this._visible = true;

		// Place the box on the caret's side, flipping only if that side has no room
		// within the visible viewport. Convert the editor-local caret through the
		// editor's coordinate boundary for the client-space fit test.
		const widgetHeight = el.offsetHeight;
		const viewport = this._getViewportRect();
		const transform = this._view.coordinateSpace.capture();
		const clientCaretRect = transform.toClientRect(caretRect);
		const clientWidgetHeight = transform.toClientRect(Rect2D.fromPointSize(0, 0, 0, widgetHeight)).height;
		const clientGap = transform.toClientRect(Rect2D.fromPointSize(0, 0, 0, this._gap)).height;
		const caretTop = clientCaretRect.top;
		const caretBottom = clientCaretRect.bottom;
		const roomBelow = caretBottom + clientGap + clientWidgetHeight <= viewport.bottom;
		const roomAbove = caretTop - clientGap - clientWidgetHeight >= viewport.top;
		const placeAbove = preferAbove ? (roomAbove || !roomBelow) : (!roomBelow && roomAbove);
		const topPx = placeAbove
			? caretRect.y - this._gap - widgetHeight
			: caretRect.y + caretRect.height + this._gap;

		this._anchorX = caretRect.x;
		this._layoutHorizontally();
		el.style.top = `${topPx}px`;
	}

	private _layoutHorizontally(): void {
		const el = this._widget.element;
		const containerWidth = this._view.overlayContainer.clientWidth;
		el.style.maxWidth = `${Math.max(0, containerWidth - this._gap)}px`;
		const maxLeft = Math.max(0, containerWidth - el.offsetWidth - this._gap);
		el.style.left = `${Math.min(Math.max(0, this._anchorX), maxLeft)}px`;
	}

	/** Force-hide and clear the box (used by Escape and submit). */
	private _hide(): void {
		if (!this._visible) { return; }
		this._visible = false;
		this._pinnedRange = undefined;
		this._widget.clear();
		this._widget.element.style.display = 'none';
		this._view.element.classList.remove('md-comment-active');
	}

	/**
	 * Hide unless the user is engaged with the box: it has focus or holds a
	 * non-empty draft. This preserves in-progress text and keeps a focused box
	 * open (it is dismissed explicitly via Escape/submit, or by blurring it).
	 */
	private _autoHide(): void {
		if (this._widgetHasFocus() || this._widget.value.get().trim().length > 0) { return; }
		this._hide();
	}

	private _widgetHasFocus(): boolean {
		const active = this._view.element.ownerDocument.activeElement;
		return active !== null && this._widget.element.contains(active);
	}

	/**
	 * The visible viewport (client coords) used for the flip-above decision: the
	 * nearest scrollable ancestor of the editor. `.md-editor` itself spans the
	 * full document height and never clips, so measuring against it would always
	 * report room below. Falls back to the window when nothing scrolls.
	 */
	private _getViewportRect(): { top: number; bottom: number } {
		const win = this._view.element.ownerDocument.defaultView;
		let el: HTMLElement | null = this._view.element;
		while (el) {
			const overflowY = win?.getComputedStyle(el).overflowY;
			if ((overflowY === 'auto' || overflowY === 'scroll') && el.scrollHeight > el.clientHeight) {
				const rect = el.getBoundingClientRect();
				return { top: rect.top, bottom: rect.bottom };
			}
			el = el.parentElement;
		}
		return { top: 0, bottom: win?.innerHeight ?? 0 };
	}

	private _hideAndRefocus(): void {
		this._hide();
		this._view.focus();
	}

	private _submit(text: string): void {
		const range = this._pinnedRange;
		// Remember the range so the box doesn't immediately reappear for the text
		// that is still selected after submitting.
		this._submittedRange = range;
		this._hideAndRefocus();
		if (range) {
			this._options?.onSubmit?.({ text, range });
		}
	}
}

function assertNever(value: never): never {
	throw new Error(`Unhandled selection source: ${JSON.stringify(value)}`);
}
