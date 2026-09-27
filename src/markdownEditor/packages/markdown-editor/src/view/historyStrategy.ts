import { computeMinimalEdit, type StringEdit } from '../core/stringEdit.js';
import type { Selection } from '../core/selection.js';
import type { EditorModel } from '../model/editorModel.js';

/**
 * Routes undo and redo to whatever owns the document's history: the editor
 * itself on a standalone page, or the enclosing document in a host like
 * VS Code.
 */
export interface IHistoryStrategy {
	undo(): void;
	redo(): void;

	/**
	 * Invoked around each source mutation so the strategy can record it.
	 * Implemented only by strategies that build their own history; a host that
	 * forwards edits to a VS Code `TextDocument` lets it record them instead.
	 */
	record?(operation: () => void, edit?: StringEdit): void;
}

interface HistoryEntry {
	readonly undoEdit: StringEdit;
	readonly redoEdit: StringEdit;
	readonly beforeSelection: Selection | undefined;
	readonly afterSelection: Selection | undefined;
}

const MAX_HISTORY_ENTRIES = 200;

/**
 * Compact in-memory history for editors that hold the only copy of the
 * document, such as a standalone browser page. Where the surrounding host
 * already records history — a VS Code `TextDocument` — forward to that
 * instead.
 */
export class LocalHistoryStrategy implements IHistoryStrategy {
	private readonly _past: HistoryEntry[] = [];
	private readonly _future: HistoryEntry[] = [];

	/**
	 * The source text as of the last change this strategy recorded or applied.
	 * Any other value means the document was replaced behind its back, so the
	 * stored edits no longer line up and must be discarded rather than applied.
	 */
	private _lastKnownText: string;

	constructor(private readonly _model: EditorModel) {
		this._lastKnownText = _model.sourceText.get().value;
	}

	record(operation: () => void, edit?: StringEdit): void {
		const beforeText = this._model.sourceText.get().value;
		if (beforeText !== this._lastKnownText) {
			this._clear(beforeText);
		}
		const beforeSelection = this._model.selection.get();
		operation();
		const afterText = this._model.sourceText.get().value;
		const afterSelection = this._model.selection.get();
		this._lastKnownText = afterText;
		if (beforeText === afterText) {
			return;
		}

		const redoEdit = edit?.apply(beforeText) === afterText
			? edit
			: computeMinimalEdit(beforeText, afterText);
		this._past.push({
			undoEdit: redoEdit.inverse(beforeText),
			redoEdit,
			beforeSelection,
			afterSelection,
		});
		if (this._past.length > MAX_HISTORY_ENTRIES) {
			this._past.shift();
		}
		this._future.length = 0;
	}

	undo(): void {
		const entry = this._peekApplicable(this._past);
		if (entry && this._apply(entry.undoEdit, entry.beforeSelection)) {
			this._past.pop();
			this._future.push(entry);
		}
	}

	redo(): void {
		const entry = this._peekApplicable(this._future);
		if (entry && this._apply(entry.redoEdit, entry.afterSelection)) {
			this._future.pop();
			this._past.push(entry);
		}
	}

	/** The entry on top of `stack`, or `undefined` when it cannot be applied. */
	private _peekApplicable(stack: readonly HistoryEntry[]): HistoryEntry | undefined {
		if (this._model.readonlyMode.get()) {
			return undefined;
		}
		const entry = stack.at(-1);
		if (!entry) {
			return undefined;
		}
		const currentText = this._model.sourceText.get().value;
		if (currentText !== this._lastKnownText) {
			this._clear(currentText);
			return undefined;
		}
		return entry;
	}

	private _apply(edit: StringEdit, selection: Selection | undefined): boolean {
		const targetText = edit.apply(this._lastKnownText);
		this._model.applyEdit(edit, selection);
		if (this._model.sourceText.get().value !== targetText) {
			return false;
		}
		if (selection === undefined) {
			this._model.selection.set(undefined, undefined);
		}
		this._lastKnownText = targetText;
		return true;
	}

	private _clear(knownText: string): void {
		this._past.length = 0;
		this._future.length = 0;
		this._lastKnownText = knownText;
	}
}
