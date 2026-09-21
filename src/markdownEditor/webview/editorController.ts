import { Disposable } from './disposable';
import {
	EditorModel,
	Selection,
	applyHardBreak,
	applySmartEnter,
	deleteSelectionOrBackward,
	deleteSelectionOrForward,
	lineSelectionBounds,
	wordBounds,
} from '../core/index';
import type { EditorView } from './editorView';

export class AsyncClipboardStrategy {}

export class LocalHistoryStrategy {
	constructor(readonly model: EditorModel) {
		model.enableLocalHistory();
	}

	undo = (): void => {
		this.model.undo();
	};

	redo = (): void => {
		this.model.redo();
	};
}

export interface HistoryStrategy {
	undo(): void;
	redo(): void;
}

export interface EditorControllerOptions {
	readonly clipboardStrategy?: AsyncClipboardStrategy;
	readonly keyboardProfile?: unknown;
	readonly historyStrategy?: HistoryStrategy;
	readonly find?: boolean;
}

export const markdownEditorKeyboardProfile = {
	bindings: [
		{ key: 'Enter', modifiers: { shift: false, ctrl: false, meta: false }, action: { kind: 'enter', command: 'smartEnter' } },
		{ key: 'Enter', modifiers: { shift: true, ctrl: false, meta: false }, action: { kind: 'enter', command: 'insertHardLineBreak' } },
	],
};

const SELECTION_SYNC_KEYS = new Set([
	'ArrowLeft',
	'ArrowRight',
	'ArrowUp',
	'ArrowDown',
	'Home',
	'End',
	'PageUp',
	'PageDown',
]);

export class EditorController extends Disposable {
	readonly #model: EditorModel;
	readonly #view: EditorView;
	readonly #history: HistoryStrategy | undefined;
	#pointerDragging = false;
	#pointerId: number | undefined;

	constructor(model: EditorModel, view: EditorView, options: EditorControllerOptions = {}) {
		super();
		this.#model = model;
		this.#view = view;
		this.#history = options.historyStrategy;
		view.element.addEventListener('keydown', this.#onKeyDown);
		view.element.addEventListener('beforeinput', this.#onBeforeInput);
		view.element.addEventListener('compositionend', this.#onCompositionEnd);
		view.element.addEventListener('pointerdown', this.#onPointerDown);
		view.element.addEventListener('pointermove', this.#onPointerMove);
		view.element.addEventListener('pointerup', this.#onPointerUp);
		view.element.addEventListener('pointercancel', this.#onPointerUp);
		view.element.addEventListener('copy', this.#onCopy);
		view.element.addEventListener('cut', this.#onCut);
		view.element.addEventListener('paste', this.#onPaste);
		document.addEventListener('selectionchange', this.#onSelectionChange);
		this._register({
			dispose: () => {
				view.element.removeEventListener('keydown', this.#onKeyDown);
				view.element.removeEventListener('beforeinput', this.#onBeforeInput);
				view.element.removeEventListener('compositionend', this.#onCompositionEnd);
				view.element.removeEventListener('pointerdown', this.#onPointerDown);
				view.element.removeEventListener('pointermove', this.#onPointerMove);
				view.element.removeEventListener('pointerup', this.#onPointerUp);
				view.element.removeEventListener('pointercancel', this.#onPointerUp);
				view.element.removeEventListener('copy', this.#onCopy);
				view.element.removeEventListener('cut', this.#onCut);
				view.element.removeEventListener('paste', this.#onPaste);
				document.removeEventListener('selectionchange', this.#onSelectionChange);
			},
		});
	}

	readonly #onSelectionChange = (): void => {
		if (this.#pointerDragging) {
			return;
		}
		if (document.activeElement !== this.#view.element) {
			return;
		}
		const dom = window.getSelection();
		if (!dom?.anchorNode || !this.#view.element.contains(dom.anchorNode)) {
			return;
		}
		this.#syncFromDom();
	};

	readonly #onPointerDown = (event: PointerEvent): void => {
		if (event.button !== 0) {
			return;
		}
		const target = event.target;
		if (target instanceof Element && target.closest('a[href], .md-task-checkbox, .md-readonly-toggle, .ib-mermaid-open-preview, .ib-html-preview, .ib-skill-properties-panel, button, input, textarea, select')) {
			return;
		}
		const offset = this.#view.offsetFromPointer(event.clientX, event.clientY);
		if (offset === undefined) {
			return;
		}
		event.preventDefault();
		this.#view.focus();

		const source = this.#model.getText();
		if (event.detail >= 3) {
			const { start, endExclusive } = lineSelectionBounds(source, offset);
			this.#setSelection(start, endExclusive);
			return;
		}
		if (event.detail === 2) {
			const { start, end } = wordBounds(source, offset);
			this.#setSelection(start, end);
			return;
		}

		const current = this.#model.selection.get();
		if (event.shiftKey) {
			const anchor = current?.anchor ?? offset;
			this.#setSelection(anchor, offset);
		} else {
			this.#setSelection(offset, offset);
		}

		this.#pointerDragging = true;
		this.#pointerId = event.pointerId;
		this.#view.element.setPointerCapture(event.pointerId);
	};

	readonly #onPointerMove = (event: PointerEvent): void => {
		if (!this.#pointerDragging || event.pointerId !== this.#pointerId) {
			return;
		}
		const offset = this.#view.offsetFromPointer(event.clientX, event.clientY);
		if (offset === undefined) {
			return;
		}
		const current = this.#model.selection.get();
		if (!current) {
			return;
		}
		if (current.active === offset) {
			return;
		}
		this.#setSelection(current.anchor, offset);
		event.preventDefault();
	};

	readonly #onPointerUp = (event: PointerEvent): void => {
		if (event.pointerId !== this.#pointerId) {
			return;
		}
		if (this.#pointerDragging) {
			try {
				this.#view.element.releasePointerCapture(event.pointerId);
			} catch {
				// capture may already be released
			}
			this.#pointerDragging = false;
			this.#pointerId = undefined;
		}
	};

	readonly #onKeyDown = (event: KeyboardEvent): void => {
		const chord = event.ctrlKey || event.metaKey;
		if (chord && event.key.toLowerCase() === 'a') {
			event.preventDefault();
			const length = this.#model.getText().length;
			this.#setSelection(0, length);
			return;
		}
		if (SELECTION_SYNC_KEYS.has(event.key)) {
			queueMicrotask(() => this.#syncFromDom());
		}
		if (this.#model.readonlyMode.get()) {
			return;
		}
		if (chord && event.key.toLowerCase() === 'z') {
			event.preventDefault();
			if (event.shiftKey) {
				this.#history?.redo();
			} else {
				this.#history?.undo();
			}
			return;
		}
		if (chord && event.key.toLowerCase() === 'y') {
			event.preventDefault();
			this.#history?.redo();
			return;
		}
		if (event.key === 'Enter') {
			event.preventDefault();
			const sel = this.#range();
			if (event.shiftKey) {
				const edit = applyHardBreak(sel.start);
				this.#model.replaceRange(edit.start, edit.endExclusive, edit.text, edit.caret);
			} else {
				const edit = applySmartEnter(this.#model.getText(), sel.start);
				this.#model.replaceRange(edit.start, edit.endExclusive, edit.text, edit.caret);
			}
			return;
		}
		if (event.key === 'Backspace') {
			event.preventDefault();
			const sel = this.#range();
			const edit = deleteSelectionOrBackward(this.#model.getText(), sel.start, sel.end);
			this.#model.replaceRange(edit.start, edit.endExclusive, edit.text, edit.caret);
			return;
		}
		if (event.key === 'Delete') {
			event.preventDefault();
			const sel = this.#range();
			const edit = deleteSelectionOrForward(this.#model.getText(), sel.start, sel.end);
			this.#model.replaceRange(edit.start, edit.endExclusive, edit.text, edit.caret);
			return;
		}
	};

	readonly #onBeforeInput = (event: InputEvent): void => {
		event.preventDefault();
		if (this.#model.readonlyMode.get() || event.isComposing) {
			return;
		}
		if (event.inputType === 'insertText' && event.data) {
			this.#insert(event.data);
		}
	};

	readonly #onCompositionEnd = (event: CompositionEvent): void => {
		if (this.#model.readonlyMode.get() || !event.data) {
			return;
		}
		this.#insert(event.data);
	};

	#insert(text: string): void {
		const sel = this.#range();
		this.#model.replaceRange(sel.start, sel.end, text, sel.start + text.length);
	}

	readonly #onCopy = (event: ClipboardEvent): void => {
		this.#syncFromDom();
		const sel = this.#range();
		if (sel.end === sel.start) {
			if (!this.#domSelectionCollapsed()) {
				event.preventDefault();
			}
			return;
		}
		event.preventDefault();
		event.clipboardData?.setData('text/plain', this.#model.getText().slice(sel.start, sel.end));
	};

	readonly #onCut = (event: ClipboardEvent): void => {
		if (this.#model.readonlyMode.get()) {
			return;
		}
		this.#syncFromDom();
		const sel = this.#range();
		if (sel.end === sel.start) {
			return;
		}
		event.preventDefault();
		event.clipboardData?.setData('text/plain', this.#model.getText().slice(sel.start, sel.end));
		this.#model.replaceRange(sel.start, sel.end, '', sel.start);
	};

	readonly #onPaste = (event: ClipboardEvent): void => {
		if (this.#model.readonlyMode.get()) {
			return;
		}
		this.#syncFromDom();
		const text = event.clipboardData?.getData('text/plain') ?? '';
		if (text === '') {
			return;
		}
		event.preventDefault();
		const sel = this.#range();
		this.#model.replaceRange(sel.start, sel.end, text, sel.start + text.length);
	};

	#setSelection(anchor: number, active: number): void {
		const current = this.#model.selection.get();
		if (current?.anchor === anchor && current?.active === active) {
			return;
		}
		this.#model.selection.set(new Selection(anchor, active), undefined);
	}

	#range(): { start: number; end: number } {
		const selection = this.#model.selection.get();
		if (!selection) {
			const length = this.#model.getText().length;
			return { start: length, end: length };
		}
		return { start: selection.start, end: selection.endExclusive };
	}

	#domSelectionCollapsed(): boolean {
		const dom = window.getSelection();
		if (!dom || dom.rangeCount === 0) {
			return true;
		}
		if (!dom.anchorNode || !this.#view.element.contains(dom.anchorNode)) {
			return true;
		}
		return dom.isCollapsed;
	}

	#syncFromDom(): void {
		const dom = window.getSelection();
		if (!dom || dom.rangeCount === 0) {
			return;
		}
		if (!dom.anchorNode || !this.#view.element.contains(dom.anchorNode)) {
			return;
		}
		const doc = this.#view.documentViewNode.get();
		if (!doc) {
			return;
		}
		const focusNode = dom.focusNode ?? dom.anchorNode;
		const anchor = doc.resolveSource({ node: dom.anchorNode, offset: dom.anchorOffset });
		const active = doc.resolveSource({
			node: focusNode,
			offset: dom.focusOffset ?? dom.anchorOffset,
		});
		if (anchor === undefined || active === undefined) {
			return;
		}
		this.#setSelection(anchor, active);
	}
}
