import { Disposable } from './disposable';
import {
	EditorModel,
	Selection,
	applyHardBreak,
	applySmartEnter,
	deleteSelectionOrBackward,
	deleteSelectionOrForward,
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

export class EditorController extends Disposable {
	readonly #model: EditorModel;
	readonly #view: EditorView;
	readonly #history: HistoryStrategy | undefined;

	constructor(model: EditorModel, view: EditorView, options: EditorControllerOptions = {}) {
		super();
		this.#model = model;
		this.#view = view;
		this.#history = options.historyStrategy;
		view.element.addEventListener('keydown', this.#onKeyDown);
		view.element.addEventListener('beforeinput', this.#onBeforeInput);
		view.element.addEventListener('compositionend', this.#onCompositionEnd);
		view.element.addEventListener('pointerdown', this.#onPointerDown);
		view.element.addEventListener('copy', this.#onCopy);
		view.element.addEventListener('cut', this.#onCut);
		view.element.addEventListener('paste', this.#onPaste);
		this._register({
			dispose: () => {
				view.element.removeEventListener('keydown', this.#onKeyDown);
				view.element.removeEventListener('beforeinput', this.#onBeforeInput);
				view.element.removeEventListener('compositionend', this.#onCompositionEnd);
				view.element.removeEventListener('pointerdown', this.#onPointerDown);
				view.element.removeEventListener('copy', this.#onCopy);
				view.element.removeEventListener('cut', this.#onCut);
				view.element.removeEventListener('paste', this.#onPaste);
			},
		});
	}

	readonly #onPointerDown = (event: PointerEvent): void => {
		if (event.button !== 0 || this.#model.readonlyMode.get()) {
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
		this.#model.selection.set(Selection.collapsed(offset), undefined);
	};

	readonly #onKeyDown = (event: KeyboardEvent): void => {
		if (this.#model.readonlyMode.get()) {
			return;
		}
		const chord = event.ctrlKey || event.metaKey;
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
		if (event.key === 'ArrowLeft' || event.key === 'ArrowRight' || event.key === 'ArrowUp' || event.key === 'ArrowDown' || event.key === 'Home' || event.key === 'End') {
			queueMicrotask(() => this.#syncFromDom());
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
	};

	readonly #onCopy = (event: ClipboardEvent): void => {
		const sel = this.#range();
		if (sel.end === sel.start) {
			return;
		}
		event.preventDefault();
		event.clipboardData?.setData('text/plain', this.#model.getText().slice(sel.start, sel.end));
	};

	readonly #onCut = (event: ClipboardEvent): void => {
		if (this.#model.readonlyMode.get()) {
			return;
		}
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
		const text = event.clipboardData?.getData('text/plain');
		if (text === undefined) {
			return;
		}
		event.preventDefault();
		const sel = this.#range();
		this.#model.replaceRange(sel.start, sel.end, text, sel.start + text.length);
	};

	#range(): { start: number; end: number } {
		const selection = this.#model.selection.get();
		if (!selection) {
			const length = this.#model.getText().length;
			return { start: length, end: length };
		}
		return { start: selection.start, end: selection.endExclusive };
	}

	#syncFromDom(): void {
		const dom = window.getSelection();
		if (!dom || dom.rangeCount === 0) {
			return;
		}
		const range = dom.getRangeAt(0);
		const start = this.#view.documentViewNode.get()?.resolveSource({ node: range.startContainer, offset: range.startOffset });
		const end = this.#view.documentViewNode.get()?.resolveSource({ node: range.endContainer, offset: range.endOffset });
		if (start === undefined || end === undefined) {
			return;
		}
		this.#model.selection.set(new Selection(start, end), undefined);
	}
}
