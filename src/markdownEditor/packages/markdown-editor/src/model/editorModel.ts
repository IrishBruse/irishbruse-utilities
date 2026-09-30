import { observableValue, derived, transaction } from '@vscode/observables';
import type { IDisposable, ITransaction } from '@vscode/observables';
import type { SourceOffset } from '../core/sourceOffset.js';
import { CursorPosition, VirtualCursorLine } from '../core/cursorPosition.js';
import { OffsetRange } from '../core/offsetRange.js';
import type { GutterMarker } from '../core/gutterMarker.js';
import { StringValue } from '../core/stringValue.js';
import { computeMinimalEdit, StringEdit } from '../core/stringEdit.js';
import { Selection } from '../core/selection.js';
import { DEFAULT_WORD_NAVIGATION_CONFIG, type WordNavigationConfig } from '../core/wordUtils.js';
import { MarkdownParser } from '../parser/parser.js';
import {
	findNodeOffsetById, ParagraphAstNode, taskCheckboxRange, VideoAstNode,
	type AstNode,
	type BlockAstNode, type DocumentAstNode, type ListItemAstNode,
} from '../parser/ast.js';
import { computeStringEdit, classifyDiff, diffComputerReady } from '../diff/index.js';
import type { DiffItem } from '../diff/index.js';

export const NO_ACTIVE_BLOCKS = Symbol('NO_ACTIVE_BLOCKS');

/**
 * A *transient* editing state: an empty paragraph adjacent to a real block.
 * Markdown has no empty-paragraph node, so this never lives in
 * {@link EditorModel['sourceText']} or the parsed {@link EditorModel.document}
 * — it is pure edit intent that the view renders as a synthetic blank line and
 * that the controller either *materializes* (the user types) or *cancels* (the
 * user navigates away / backspaces).
 */
export interface PendingParagraph {
	/** The block the blank line is rendered directly after. */
	readonly anchorBlock: BlockAstNode;
	/**
	 * Source region rewritten when the pending paragraph is materialized — the
	 * gap between {@link anchorBlock}'s text and whatever follows it.
	 */
	readonly replaceRange: OffsetRange;
	/** Whether materialized text needs a blank-line separator before it. */
	readonly separateFromPreviousBlock: boolean;
	/** Whether {@link replaceRange} ends at the end of the document. */
	readonly atEof: boolean;
	/**
	 * Horizontal whitespace typed on the source-less line. It remains transient
	 * until other input materializes the paragraph. Contains only spaces and tabs.
	 */
	readonly text: string;
	/** The source-less visual line occupied by the pending caret. */
	readonly cursorLine: VirtualCursorLine;
	/**
	 * A throwaway AST node that exists only to give the synthetic view child a
	 * stable identity across render frames (the view pairs nodes by `ast.id`).
	 * It is never part of {@link document}.
	 */
	readonly syntheticAst: ParagraphAstNode;
}

/** Metadata delivered synchronously immediately before a model-owned source edit is applied. */
export interface SourceEditEvent {
	readonly baseSourceTextId: number;
	readonly resultSourceTextId: number;
	readonly edit: StringEdit;
	readonly transaction: ITransaction;
}

/** The interaction that produced the current editor selection. */
export type SelectionSource = 'user' | 'find';

export class EditorModel {
	private readonly _parser = new MarkdownParser();
	private readonly _sourceEditListeners = new Set<(event: SourceEditEvent) => void>();
	private readonly _sourceTextIds = new WeakMap<StringValue, number>();
	private _lastSourceTextId = 0;

	/**
	 * The most recent edit applied to {@link sourceText}, used by
	 * {@link document} to let the parser link incrementally edited code
	 * blocks. Only trusted when it exactly bridges the previous and current
	 * source text (see {@link document}).
	 */
	private _pendingEdit: { baseText: string; newText: string; edit: StringEdit } | undefined;

	readonly sourceText = observableValue<StringValue>(this, new StringValue(''));
	readonly wordNavigationConfig = observableValue<WordNavigationConfig>(this, DEFAULT_WORD_NAVIGATION_CONFIG);

	/**
	 * Read-only mode. When `true`, the editor never reveals a block's source
	 * markers (markdown special characters like `**`, `#`, list bullets, code
	 * fences, `$…$`) — every block stays in its clean rendered form regardless of
	 * where the caret/selection is — and text-editing commands are ignored.
	 * Explicit interactions with rendered controls, such as task checkboxes,
	 * remain available. Plain text selection still works everywhere (so the user
	 * can copy). The default (`false`) is the normal editing mode where the active
	 * block reveals its markers.
	 */
	readonly readonlyMode = observableValue<boolean>(this, false);
	/**
	 * The current selection, or `undefined` when the editor has no caret
	 * (e.g. an inactive/unfocused rendering).
	 */
	readonly selection = observableValue<Selection | undefined>(this, undefined);

	/**
	 * When set, the caret at this offset is drawn on the right edge of a newline
	 * glyph instead of at the start of the following line.
	 */
	readonly cursorAffinity = observableValue<{ readonly offset: SourceOffset } | undefined>(this, undefined);
	readonly selectionSource = observableValue<SelectionSource>(this, 'user');

	/**
	 * Whether a Ctrl/Cmd modifier is currently held. Set by the controller from
	 * live keyboard state; the view reads it to show the link-open affordance
	 * (underline + pointer cursor) only while a Ctrl/Cmd+click would open a link
	 * whose block is active.
	 */
	readonly ctrlOrMetaDown = observableValue<boolean>(this, false);

	/**
	 * Whether a pointer-driven selection drag is currently in progress. Set by
	 * the controller between the pointer-down that starts the drag and the
	 * pointer-up/cancel that ends it. Contributions read it to defer UI that
	 * would otherwise flicker mid-drag (e.g. the comment input box appears only
	 * once the drag ends).
	 */
	readonly isSelecting = observableValue<boolean>(this, false);

	/**
	 * Gutter markers (source-control style change indicators) painted in the
	 * left gutter. Each entry maps a source {@link OffsetRange} to a change kind
	 * — see {@link GutterMarker}. Purely decorative: markers never affect the
	 * parsed {@link document}, selection, or layout. Empty by default.
	 */
	readonly gutterMarkers = observableValue<readonly GutterMarker[]>(this, []);

	/**
	 * Forces the rendered active-block set. `undefined` (the default)
	 * derives the set from the current selection range (see
	 * {@link activeBlocks}). The sentinel {@link NO_ACTIVE_BLOCKS} forces
	 * "no active block" — useful in fixtures that always want the
	 * collapsed/inactive rendering.
	 */
	readonly activeBlocksOverride = observableValue<readonly BlockAstNode[] | typeof NO_ACTIVE_BLOCKS | undefined>(this, undefined);

	/**
	 * The transient empty-paragraph editing state, or `undefined` when none is
	 * armed. See {@link PendingParagraph}. This is *not* document data — it is
	 * cleared by any source edit and lives only between the Enter that armed it
	 * and the next content-producing edit.
	 */
	readonly pendingParagraph = observableValue<PendingParagraph | undefined>(this, undefined);

	/** Switches between editing and locked mode and clears transient edit intent. */
	toggleReadonlyMode(): void {
		transaction(tx => {
			this.pendingParagraph.set(undefined, tx);
			this.readonlyMode.set(!this.readonlyMode.get(), tx);
		});
	}

	readonly cursorOffset = derived(this, reader =>
		reader.readObservable(this.selection)?.active,
	);

	readonly cursorPosition = derived(this, reader => {
		const pending = reader.readObservable(this.pendingParagraph);
		if (pending) {
			return CursorPosition.virtual(pending.cursorLine);
		}
		const offset = reader.readObservable(this.selection)?.active;
		if (offset === undefined) { return undefined; }
		const affinity = reader.readObservable(this.cursorAffinity);
		return CursorPosition.source(offset, affinity?.offset === offset ? 'upstream' : undefined);
	});

	/**
	 * The parsed document. Threads the previous document into the parser so
	 * unchanged blocks keep their object identity across reparses (see
	 * {@link MarkdownParser.parse}). Writing `previous` inside the compute is
	 * safe: unchanged source reuses it directly, while changed source produces
	 * a result structurally identical to a full reparse.
	 */
	readonly document = (() => {
		let previous: DocumentAstNode | undefined;
		let previousText: string | undefined;
		return derived(this, reader => {
			const text = reader.readObservable(this.sourceText);
			if (previous && previousText === text.value) {
				return previous;
			}
			const pending = this._pendingEdit;
			const edit = pending && pending.baseText === previousText && pending.newText === text.value
				? pending.edit
				: undefined;
			const next = this._parser.parse(text, previous, edit);
			previous = next;
			previousText = text.value;
			return next;
		});
	})();

	/**
	 * Block that contains the cursor (selection's active end). Used by
	 * cursor navigation to know which block's marker ranges count as
	 * visible. Unaffected by {@link activeBlocksOverride} because
	 * navigation is independent of rendering.
	 */
	readonly activeBlock = derived(this, reader => {
		const doc = reader.readObservable(this.document);
		const cursor = reader.readObservable(this.cursorOffset);
		if (cursor === undefined) { return undefined; }
		const affinity = reader.readObservable(this.cursorAffinity);
		return findBlockAtOffset(doc, cursor, affinity?.offset === cursor);
	});

	/**
	 * All blocks whose source range intersects the current selection.
	 * The rendering side uses this to decide which blocks render in
	 * their expanded (markers-visible) form. When the selection is
	 * collapsed this is a one-element set holding {@link activeBlock}.
	 */
	readonly activeBlocks = derived(this, reader => {
		// Read-only mode never reveals markers: no block is ever active, so every
		// block renders in its clean form. Selection still works (it is DOM-based
		// and independent of the active set).
		if (this.readonlyMode.read(reader)) {
			return new Set<BlockAstNode>();
		}
		// While an empty paragraph is pending, the caret lives on the synthetic
		// blank line, not in any real block — so no AST block is active (the
		// anchor paragraph renders in its normal, rendered form).
		if (reader.readObservable(this.pendingParagraph) !== undefined) {
			return new Set<BlockAstNode>();
		}
		const override = reader.readObservable(this.activeBlocksOverride);
		if (override === NO_ACTIVE_BLOCKS) { return new Set<BlockAstNode>(); }
		if (override !== undefined) { return new Set<BlockAstNode>(override); }
		const doc = reader.readObservable(this.document);
		const sel = reader.readObservable(this.selection);
		if (sel === undefined) { return new Set<BlockAstNode>(); }
		if (sel.isCollapsed) {
			const affinity = reader.readObservable(this.cursorAffinity);
			const block = findBlockAtOffset(doc, sel.active, affinity?.offset === sel.active);
			return block ? new Set<BlockAstNode>([block]) : new Set<BlockAstNode>();
		}
		return new Set<BlockAstNode>(blocksIntersecting(doc, sel.range.start, sel.range.endExclusive));
	});

	/**
	 * The baseline document to diff against. When set, the editor renders in
	 * diff mode: the modified document ({@link document}) stays editable, while
	 * the baseline's removed/changed blocks are shown as read-only decorations.
	 * `undefined` (the default) renders normally.
	 */
	readonly baseline = observableValue<StringValue | undefined>(this, undefined);

	private readonly _baselineDocument = derived(this, reader => {
		const b = reader.readObservable(this.baseline);
		return b ? this._parser.parse(b) : undefined;
	});

	/**
	 * The diff of {@link baseline} → {@link document}, or `undefined` when no
	 * baseline is set. The view renders the {@link DiffItem}s as stacked
	 * decorations; `insertedRanges` (modified-side change spans) drive the green
	 * word-level highlight.
	 */
	readonly diff = derived(this, reader => {
		const baselineDoc = reader.readObservable(this._baselineDocument);
		const baseline = reader.readObservable(this.baseline);
		if (!baselineDoc || !baseline) { return undefined; }
		// No diff until the @vscode/diff algorithm has loaded (near-instant).
		if (!reader.readObservable(diffComputerReady)) { return undefined; }
		const modifiedDoc = reader.readObservable(this.document);
		const modifiedText = reader.readObservable(this.sourceText);
		const edit = computeStringEdit(baseline.value, modifiedText.value);
		const items = classifyDiff(baselineDoc, modifiedDoc, edit);
		// Green word rects only for *partial* changes (`replaced`, and anything
		// inside a recursively-diffed container). Whole added blocks get a solid
		// band instead, so they contribute no inline rects.
		const insertedRanges: OffsetRange[] = [];
		const collect = (list: readonly DiffItem[], topLevel: boolean): void => {
			for (const it of list) {
				if (it.kind === 'replaced') {
					for (const r of it.insertedLocal) { insertedRanges.push(r.range.delta(it.modifiedStart)); }
				} else if (it.kind === 'added' && !topLevel) {
					for (const r of it.insertedLocal) { insertedRanges.push(r.range.delta(it.modifiedStart)); }
				} else if (it.kind === 'nested') {
					collect(it.children, false);
				}
			}
		};
		collect(items, true);
		// Partially-changed (`replaced`) blocks render in active/source form so
		// marker-level modifications are visible. Whole added blocks stay rendered.
		const changedBlocks = new Set<BlockAstNode>();
		const collectVideoBlocks = (node: AstNode): void => {
			if (node instanceof VideoAstNode) {
				changedBlocks.add(node);
				return;
			}
			for (const child of node.children) { collectVideoBlocks(child); }
		};
		for (const it of items) {
			if (it.kind === 'replaced') { changedBlocks.add(it.modified as BlockAstNode); }
		}
		const collectChangedVideos = (list: readonly DiffItem[]): void => {
			for (const item of list) {
				if (item.kind === 'replaced') {
					collectVideoBlocks(item.modified);
				} else if (item.kind === 'nested') {
					collectChangedVideos(item.children);
				}
			}
		};
		collectChangedVideos(items);
		return { items, insertedRanges, changedBlocks };
	});

	readonly markerVisibleBlocks = derived(this, reader => {
		const activeBlocks = reader.readObservable(this.activeBlocks);
		const diff = reader.readObservable(this.diff);
		const incompleteCodeBlocks = this.readonlyMode.read(reader)
			? []
			: reader.readObservable(this.document).blocks.filter(
				block => block.kind === 'codeBlock'
					&& block.openFence !== undefined
					&& block.closeFence === undefined,
			);
		if (!diff && incompleteCodeBlocks.length === 0) { return activeBlocks; }
		return new Set([
			...activeBlocks,
			...(diff?.changedBlocks ?? []),
			...incompleteCodeBlocks,
		]);
	});

	onWillApplySourceEdit(listener: (event: SourceEditEvent) => void): IDisposable {
		this._sourceEditListeners.add(listener);
		return { dispose: () => this._sourceEditListeners.delete(listener) };
	}

	/** Returns a stable per-object identity without retaining the source text. */
	getSourceTextId(sourceText: StringValue): number {
		let id = this._sourceTextIds.get(sourceText);
		if (id === undefined) {
			id = ++this._lastSourceTextId;
			this._sourceTextIds.set(sourceText, id);
		}
		return id;
	}

	/**
	 * Arm a {@link PendingParagraph} at the given gap, minting a fresh synthetic
	 * AST node for it, and park the caret at the gap start. No source edit is
	 * applied — the blank line exists only in the view until it is materialized.
	 */
	armPendingParagraph(req: Omit<PendingParagraph, 'syntheticAst' | 'cursorLine' | 'text'>): void {
		transaction(tx => {
			this.pendingParagraph.set({
				...req,
				text: '',
				cursorLine: new VirtualCursorLine(req.replaceRange.start, req.replaceRange.endExclusive),
				syntheticAst: new ParagraphAstNode([]),
			}, tx);
			this.selectionSource.set('user', tx);
			this.selection.set(Selection.collapsed(req.replaceRange.start), tx);
		});
	}

	/** Discard the pending paragraph (if any) without touching the source. */
	cancelPendingParagraph(): void {
		if (this.pendingParagraph.get() !== undefined) {
			this.pendingParagraph.set(undefined, undefined);
		}
	}

	/**
	 * Replace the source with an authoritative value from the host, mapping the
	 * selection through the changed span and atomically discarding transient
	 * state anchored to the previous parse.
	 */
	replaceSourceText(text: StringValue): void {
		const oldText = this.sourceText.get();
		const edit = computeMinimalEdit(oldText.value, text.value);
		const selection = this.selection.get();
		const mappedSelection = selection
			? new Selection(
				clampOffset(edit.mapOffset(clampOffset(selection.anchor, oldText.value.length)), text.value.length),
				clampOffset(edit.mapOffset(clampOffset(selection.active, oldText.value.length)), text.value.length),
			)
			: undefined;

		if (!edit.isEmpty) {
			this._pendingEdit = { baseText: oldText.value, newText: text.value, edit };
		}
		transaction(tx => {
			this.pendingParagraph.set(undefined, tx);
			if (!edit.isEmpty) {
				this.sourceText.set(text, tx);
			}
			if (mappedSelection !== selection) {
				this.selection.set(mappedSelection, tx);
			}
		});
	}

	/** Replace the transient horizontal whitespace on the pending line. */
	setPendingParagraphText(text: string): void {
		if (this.readonlyMode.get()) { return; }
		if (!/^[ \t]*$/.test(text)) {
			throw new TypeError('Pending paragraph text must contain only spaces and tabs');
		}
		const pending = this.pendingParagraph.get();
		if (!pending || pending.text === text) { return; }
		this.pendingParagraph.set({ ...pending, text }, undefined);
	}

	/**
	 * Turn the pending paragraph into real source: rewrite its gap so the typed
	 * text, including any transient indentation, is separated from its neighbours
	 * by blank lines, and place the caret after it.
	 */
	materializePendingParagraph(text: string): void {
		if (this.readonlyMode.get()) { return; }
		const pending = this.pendingParagraph.get();
		if (!pending) { return; }
		const content = pending.text + text;
		const leadingSeparator = pending.separateFromPreviousBlock ? '\n\n' : '';
		const inserted = leadingSeparator + content + (pending.atEof ? '' : '\n\n');
		const cursor = pending.replaceRange.start + leadingSeparator.length + content.length;
		const edit = StringEdit.replace(pending.replaceRange, inserted);
		this._applySourceEdit(edit, Selection.collapsed(cursor));
	}

	/** Sets a rendered task checkbox state in either editing or read-only mode. */
	setTaskCheckboxChecked(item: ListItemAstNode, checked: boolean): void {
		if (item.checked === checked) { return; }
		const itemOffset = findNodeOffsetById(this.document.get(), item);
		const checkboxRange = taskCheckboxRange(item);
		if (itemOffset === undefined || checkboxRange === undefined) { return; }
		const edit = StringEdit.replace(checkboxRange.delta(itemOffset), checked ? '[x]' : '[ ]');
		this._applySourceEdit(edit, this.selection.get() ?? Selection.collapsed(0));
	}

	applyEdit(edit: StringEdit, selection?: Selection): void {
		if (this.readonlyMode.get()) { return; }
		const sel = this.selection.get() ?? Selection.collapsed(0);
		const newActive = edit.mapOffset(sel.active);
		this._applySourceEdit(edit, selection ?? Selection.collapsed(newActive));
	}

	applyEditForSelection(edit: StringEdit): void {
		if (this.readonlyMode.get()) { return; }
		const sel = this.selection.get() ?? Selection.collapsed(0);
		const newCursor = edit.mapOffset(sel.range.endExclusive);
		this._applySourceEdit(edit, Selection.collapsed(newCursor));
	}

	private _applySourceEdit(edit: StringEdit, selection: Selection): void {
		const oldText = this.sourceText.get();
		const newText = new StringValue(edit.apply(oldText.value));
		this._pendingEdit = { baseText: oldText.value, newText: newText.value, edit };
		const sourceEditIdentity = this._identifySourceEdit(oldText, newText);

		// Keep parsing, find-state mapping, and selection rendering to one coherent reaction.
		transaction(tx => {
			this._emitWillApplySourceEdit({ ...sourceEditIdentity, edit, transaction: tx });
			this.pendingParagraph.set(undefined, tx);
			this.sourceText.set(newText, tx);
			this.selectionSource.set('user', tx);
			this.selection.set(selection, tx);
		});
	}

	private _identifySourceEdit(base: StringValue, result: StringValue): {
		readonly baseSourceTextId: number;
		readonly resultSourceTextId: number;
	} {
		return {
			baseSourceTextId: this.getSourceTextId(base),
			resultSourceTextId: this.getSourceTextId(result),
		};
	}

	private _emitWillApplySourceEdit(event: SourceEditEvent): void {
		for (const listener of this._sourceEditListeners) {
			listener(event);
		}
	}
}

function clampOffset(offset: number, textLength: number): number {
	return Math.max(0, Math.min(offset, textLength));
}

export function findBlockAtOffset(
	doc: DocumentAstNode,
	offset: SourceOffset,
	preferBlockEndingAtOffset = false,
): BlockAstNode | undefined {
	const blocks = new Set(doc.blocks);
	let pos = 0;
	let lastBlock: BlockAstNode | undefined;
	for (const child of doc.children) {
		const end = pos + child.length;
		if (blocks.has(child as BlockAstNode)) {
			// Upstream caret on a trailing `↵`: the offset is also the next
			// block's start, but the caret is still on this block's line.
			if (preferBlockEndingAtOffset && end === offset) {
				return child as BlockAstNode;
			}
			if (pos <= offset && offset < end) {
				return child as BlockAstNode;
			}
			if (end === offset) {
				lastBlock = child as BlockAstNode;
			}
		}
		pos = end;
	}
	return lastBlock;
}

/**
 * All blocks whose source range intersects `[start, endExclusive]`. A
 * collapsed range (start === endExclusive) matches the block containing
 * that offset (with the same boundary rule as {@link findBlockAtOffset}).
 */
export function blocksIntersecting(doc: DocumentAstNode, start: SourceOffset, endExclusive: SourceOffset): BlockAstNode[] {
	if (start === endExclusive) {
		const b = findBlockAtOffset(doc, start);
		return b ? [b] : [];
	}
	const out: BlockAstNode[] = [];
	const blocks = new Set(doc.blocks);
	let pos = 0;
	for (const child of doc.children) {
		const end = pos + child.length;
		if (blocks.has(child as BlockAstNode) && pos < endExclusive && end > start) {
			out.push(child as BlockAstNode);
		}
		pos = end;
	}
	return out;
}
