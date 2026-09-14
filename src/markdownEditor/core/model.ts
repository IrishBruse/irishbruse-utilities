import { parseMarkdown, type ParsedDocument } from './parse';
import { FrontMatterAstNode, type MdBlock } from './ast';
import { mapOffsetThroughEdit, OffsetRange, Selection, StringEdit, StringValue } from './edit';
import { toggleTaskAt } from './keyboard';
import { observableValue, type ISettableObservable, type ITransaction } from './observable';
import { blocksIntersecting } from './query';

class ListenerStore {
	add(disposable: { dispose(): void }): { dispose(): void } {
		return disposable;
	}
}

export class EditorModel {
	readonly sourceText: ISettableObservable<StringValue>;
	readonly selection: ISettableObservable<Selection | undefined>;
	readonly readonlyMode: ISettableObservable<boolean>;
	readonly document: ISettableObservable<ParsedDocument>;
	readonly activeBlocksOverride: ISettableObservable<readonly MdBlock[] | undefined>;
	readonly activeBlocks: ISettableObservable<ReadonlySet<MdBlock>>;
	readonly #store = new ListenerStore();
	#undo: string[] = [];
	#redo: string[] = [];
	#localHistory = false;

	constructor() {
		this.sourceText = observableValue('sourceText', new StringValue(''));
		this.selection = observableValue('selection', undefined);
		this.readonlyMode = observableValue('readonlyMode', false);
		this.document = observableValue('document', parseMarkdown(''));
		this.activeBlocksOverride = observableValue('activeBlocksOverride', undefined);
		this.activeBlocks = observableValue('activeBlocks', new Set());
		this.sourceText.recomputeInitiallyAndOnChange(this.#store, value => {
			this.document.set(parseMarkdown(value.value), undefined);
			this.#refreshActiveBlocks();
		});
		this.selection.recomputeInitiallyAndOnChange(this.#store, () => this.#refreshActiveBlocks());
		this.activeBlocksOverride.recomputeInitiallyAndOnChange(this.#store, () => this.#refreshActiveBlocks());
	}

	enableLocalHistory(): void {
		this.#localHistory = true;
	}

	getText(): string {
		return this.sourceText.get().value;
	}

	replaceSourceText(value: StringValue): void {
		const previous = this.getText();
		const next = value.value;
		const selection = this.selection.get();
		this.sourceText.set(value, undefined);
		if (selection) {
			const anchor = Math.max(0, Math.min(next.length, mapOffsetThroughEdit(selection.anchor, previous, next)));
			const active = Math.max(0, Math.min(next.length, mapOffsetThroughEdit(selection.active, previous, next)));
			this.selection.set(new Selection(anchor, active), undefined);
		}
	}

	applyEdit(edit: StringEdit, tx?: ITransaction): void {
		if (this.readonlyMode.get()) {
			return;
		}
		const previous = this.getText();
		const next = edit.apply(previous);
		if (next === previous) {
			return;
		}
		if (this.#localHistory) {
			this.#undo.push(previous);
			this.#redo.length = 0;
		}
		this.sourceText.set(new StringValue(next), tx);
		const last = edit.replacements[edit.replacements.length - 1];
		if (last) {
			const caret = last.replaceRange.start + last.newText.length;
			this.selection.set(Selection.collapsed(Math.max(0, Math.min(next.length, caret))), tx);
		}
	}

	replaceRange(start: number, endExclusive: number, text: string, caret?: number): void {
		this.applyEdit(StringEdit.replace(OffsetRange.fromTo(start, endExclusive), text));
		if (caret !== undefined) {
			this.selection.set(Selection.collapsed(Math.max(0, Math.min(this.getText().length, caret))), undefined);
		}
	}

	undo(): void {
		const previous = this.#undo.pop();
		if (previous === undefined) {
			return;
		}
		this.#redo.push(this.getText());
		this.sourceText.set(new StringValue(previous), undefined);
	}

	redo(): void {
		const next = this.#redo.pop();
		if (next === undefined) {
			return;
		}
		this.#undo.push(this.getText());
		this.sourceText.set(new StringValue(next), undefined);
	}

	cancelPendingParagraph(): void {
		// Pending paragraphs are not used in the per-block editor.
	}

	setTaskCheckboxChecked(_item: unknown, checked: boolean, offset?: number): void {
		const selection = this.selection.get();
		const at = offset ?? selection?.active ?? 0;
		const change = toggleTaskAt(this.getText(), at, checked);
		if (!change) {
			return;
		}
		this.replaceRange(change.start, change.endExclusive, change.text, change.endExclusive);
	}

	#refreshActiveBlocks(): void {
		const override = this.activeBlocksOverride.get();
		const next = override
			? new Set(override)
			: (() => {
				const selection = this.selection.get();
				const doc = this.document.get();
				if (!selection) {
					return new Set<MdBlock>();
				}
				return new Set(blocksIntersecting(doc, selection.start, selection.endExclusive));
			})();
		const previous = this.activeBlocks.get();
		if (sameBlockSet(previous, next)) {
			return;
		}
		this.activeBlocks.set(next, undefined);
	}
}

function sameBlockSet(left: ReadonlySet<MdBlock>, right: ReadonlySet<MdBlock>): boolean {
	if (left.size !== right.size) {
		return false;
	}
	for (const block of left) {
		if (!right.has(block)) {
			return false;
		}
	}
	return true;
}

export function isFrontMatter(block: MdBlock): block is FrontMatterAstNode {
	return block instanceof FrontMatterAstNode;
}
