import { findWordAt, Point2D, Selection, type EditorModel, type EditorView } from '@vscode/markdown-editor';

/**
 * Double-click selects a word, then `EditorController` returns without pointer
 * capture or a pointermove listener, so the drag never extends. Native DOM
 * selection is discarded, and `pointerdown.detail` is unreliable, so the
 * library counts clicks itself (`500` ms, `5` px, primary button only) even
 * when the point is outside the content.
 *
 * This listener is registered on the same element, in the bubble phase, after
 * that handler. Click count 1 stays character-wise and click count 3 stays a
 * block select.
 */
const MULTI_CLICK_TIME_MS = 500;
const MULTI_CLICK_DISTANCE_PX = 5;

interface WordSpan {
	readonly start: number;
	readonly end: number;
}

interface PointerDownSample {
	readonly time: number;
	readonly point: Point2D;
}

export function selectionForWordDrag(base: WordSpan, pointerOffset: number, wordAtPointer: WordSpan): Selection {
	if (pointerOffset >= base.start) {
		return new Selection(base.start, wordAtPointer.end);
	}
	return new Selection(base.end, wordAtPointer.start);
}

function setUserSelection(model: EditorModel, selection: Selection): void {
	model.selectionSource.set('user', undefined);
	model.selection.set(selection, undefined);
}

function baseWord(model: EditorModel, view: EditorView, point: Point2D): WordSpan {
	const current = model.selection.get();
	if (current) {
		return { start: current.range.start, end: current.range.endExclusive };
	}
	const text = model.sourceText.get().value;
	return findWordAt(text, view.resolveOffsetFromPoint(point) ?? text.length, model.wordNavigationConfig.get());
}

export function attachWordDragSelection(model: EditorModel, view: EditorView): { dispose(): void } {
	let clickCount = 0;
	let lastPointerDown: PointerDownSample | undefined;
	let finishDrag: (() => void) | undefined;

	const onPointerDown = (event: PointerEvent): void => {
		if (event.button !== 0) {
			return;
		}
		const point = new Point2D(event.clientX, event.clientY);
		const repeated = lastPointerDown !== undefined
			&& event.timeStamp - lastPointerDown.time < MULTI_CLICK_TIME_MS
			&& Math.abs(point.x - lastPointerDown.point.x) < MULTI_CLICK_DISTANCE_PX
			&& Math.abs(point.y - lastPointerDown.point.y) < MULTI_CLICK_DISTANCE_PX;
		clickCount = repeated ? clickCount + 1 : 1;
		lastPointerDown = { time: event.timeStamp, point };
		if (clickCount !== 2 || !view.isPointInContent(point)) {
			return;
		}

		finishDrag?.();
		const base = baseWord(model, view, point);
		const element = view.element;
		element.setPointerCapture(event.pointerId);
		model.isSelecting.set(true, undefined);

		const onPointerMove = (move: PointerEvent): void => {
			const pointerOffset = view.resolveOffsetFromPoint(new Point2D(move.clientX, move.clientY));
			if (pointerOffset === undefined) {
				return;
			}
			const text = model.sourceText.get().value;
			const wordAtPointer = findWordAt(text, pointerOffset, model.wordNavigationConfig.get());
			setUserSelection(model, selectionForWordDrag(base, pointerOffset, wordAtPointer));
		};
		const finish = (): void => {
			if (finishDrag !== finish) {
				return;
			}
			finishDrag = undefined;
			model.isSelecting.set(false, undefined);
			element.removeEventListener('pointermove', onPointerMove);
			element.removeEventListener('pointerup', finish);
			element.removeEventListener('pointercancel', finish);
			element.removeEventListener('lostpointercapture', finish);
		};
		finishDrag = finish;
		element.addEventListener('pointermove', onPointerMove);
		element.addEventListener('pointerup', finish);
		element.addEventListener('pointercancel', finish);
		element.addEventListener('lostpointercapture', finish);
	};

	view.element.addEventListener('pointerdown', onPointerDown);
	return {
		dispose(): void {
			view.element.removeEventListener('pointerdown', onPointerDown);
			finishDrag?.();
		},
	};
}
