/**
 * The view-data overlay over the {@link AstNode} tree.
 *
 * Every AST kind has a parallel `*ViewData` class that mirrors its child
 * structure but carries, on top, the *selection-derived* render inputs the
 * renderer needs (which markers are visible, which list item / table cell is
 * active, whether an inline-math / image / code block shows its source or its
 * rendered form). Scalars (`level`, `url`, `language`, …) are read through the
 * referenced {@link AstNode}, never copied, so the overlay stays a thin layer
 * and the two trees can never drift.
 *
 * Splitting these inputs out makes a selection change a pure function over the
 * *unchanged* AST: only the {@link DocumentViewData} is rebuilt (cheap — no
 * DOM), and inactive blocks reuse the previous frame's view-data subtree by
 * identity (see {@link buildDocumentViewData}), so the eventual diff against
 * the rendered tree bottoms out at the one or two nodes whose flags flipped.
 */

import { OffsetRange } from '../core/offsetRange.js';
import type { VirtualCursorLine } from '../core/cursorPosition.js';
import type { DiffItem, NestedItem, RemovedItem } from '../diff/diffItem.js';
import { findActiveListItemIndex } from '../model/cursorNavigation.js';
import { findNodeOffsetById, GlueAstNode, MarkerAstNode } from '../parser/ast.js';
import type {
	AnyAstNode, AstNode, BlockAstNode, CodeBlockAstNode, DocumentAstNode, EmphasisAstNode,
	FrontMatterAstNode, HeadingAstNode, ImageAstNode, InlineCodeAstNode, InlineMathAstNode,
	LinkAstNode, ListAstNode, ListItemAstNode, MathBlockAstNode,
	ParagraphAstNode, StrikethroughAstNode, StrongAstNode, TableAstNode, TableCellAstNode,
	TableRowAstNode, TextAstNode, ThematicBreakAstNode, VideoAstNode, BlockQuoteAstNode, UnhandledBlockAstNode,
} from '../parser/ast.js';

// ---------------------------------------------------------------------------
// Document
// ---------------------------------------------------------------------------

/**
 * The view-data root. Mirrors {@link DocumentAstNode}: {@link blocks} holds only
 * its top-level blocks (each wrapped with where it starts and whether it is
 * active), while {@link children} additionally interleaves the rendered
 * document-level glue (the blank lines between blocks) in source order.
 */
export class DocumentViewData {
	readonly kind = 'document';
	constructor(
		readonly ast: DocumentAstNode,
		readonly blocks: readonly DocumentBlockViewData[],
		/**
		 * Blocks and inter-block glue interleaved in source order — the actual
		 * mount sequence. {@link blocks} is the block-only projection used for
		 * measurement and selection.
		 */
		readonly children: readonly DocumentChildViewData[],
	) { }
}

/** A top-level block plus the document-level state the renderer applies to it. */
export interface DocumentBlockViewData {
	readonly ast: BlockAstNode;
	readonly absoluteStart: number;
	/** Whether the selection reaches this block (drives `md-block-active`). */
	readonly isActive: boolean;
	readonly view: BlockViewData;
}

/** A mounted document child: a block, a run of inter-block glue, the
 * transient empty paragraph (see {@link PendingParagraphViewData}), or a
 * {@link DiffHunkViewData diff hunk} (stacked original/modified blocks). */
export interface DocumentChildViewData {
	readonly absoluteStart: number;
	/** For a block: selection reaches it. For glue: always false (unowned, hidden). */
	readonly isActive: boolean;
	readonly view: BlockViewData | GlueViewData | PendingParagraphViewData | DiffHunkViewData | DiffDecorationViewData;
	readonly kind: 'block' | 'glue' | 'pendingParagraph' | 'diffHunk' | 'diffDecoration';
	/**
	 * Diff mode: how this (modified) block changed. `added` = a whole new block
	 * (strong green band, no inline rects); `modified` = a partial change (light
	 * band + inline rects on the changed words).
	 */
	readonly diffKind?: 'added' | 'modified';
}

// ---------------------------------------------------------------------------
// Blocks
// ---------------------------------------------------------------------------

export type BlockViewData =
	| HeadingViewData | ParagraphViewData | FrontMatterViewData | CodeBlockViewData | MathBlockViewData
	| ThematicBreakViewData | VideoViewData | BlockQuoteViewData | ListViewData | TableViewData | UnhandledBlockViewData;

export class HeadingViewData {
	readonly kind = 'heading';
	constructor(readonly ast: HeadingAstNode, readonly content: readonly AnyViewData[]) { }
}

export class ParagraphViewData {
	readonly kind = 'paragraph';
	constructor(readonly ast: ParagraphAstNode, readonly content: readonly AnyViewData[]) { }
}

/**
 * View-data for the transient empty paragraph (see `PendingParagraph` in the
 * model). It carries the throwaway {@link ParagraphAstNode} that gives the
 * rendered line a stable identity across frames, its anchor block, source-less
 * cursor line, and transient horizontal whitespace. It has no source content or
 * selection range.
 */
export class PendingParagraphViewData {
	readonly kind = 'pendingParagraph';
	constructor(
		readonly ast: ParagraphAstNode,
		readonly anchorBlock: BlockAstNode,
		readonly cursorLine: VirtualCursorLine,
		readonly text: string,
	) { }
}

export class FrontMatterViewData {
	readonly kind = 'frontMatter';
	constructor(
		readonly ast: FrontMatterAstNode,
		/** Active: render both fences; inactive: render only the opaque YAML value. */
		readonly showMarkup: boolean,
		readonly content: readonly AnyViewData[],
	) { }
}

export class CodeBlockViewData {
	readonly kind = 'codeBlock';
	constructor(
		readonly ast: CodeBlockAstNode,
		/** Active: render the fenced source; inactive: the (custom/highlighted) block. */
		readonly showMarkup: boolean,
		readonly content: readonly AnyViewData[],
	) { }
}

export class MathBlockViewData {
	readonly kind = 'mathBlock';
	constructor(
		readonly ast: MathBlockAstNode,
		/** Active: render the source; inactive: the KaTeX output. */
		readonly showMarkup: boolean,
		readonly content: readonly AnyViewData[],
	) { }
}

export class BlockQuoteViewData {
	readonly kind = 'blockQuote';
	constructor(
		readonly ast: BlockQuoteAstNode,
		readonly content: readonly AnyViewData[],
		/** False while a pending paragraph replaces the final marker-only line. */
		readonly showFinalMarkerOnlyLine: boolean,
	) { }
}

export class ListViewData {
	readonly kind = 'list';
	constructor(readonly ast: ListAstNode, readonly content: readonly AnyViewData[]) { }
}

export class TableViewData {
	readonly kind = 'table';
	constructor(readonly ast: TableAstNode, readonly content: readonly AnyViewData[]) { }
}

// ---------------------------------------------------------------------------
// Inlines
// ---------------------------------------------------------------------------

export type InlineViewData =
	| TextViewData | StrongViewData | EmphasisViewData | StrikethroughViewData
	| InlineCodeViewData | InlineMathViewData | LinkViewData | ImageViewData;

export class StrongViewData {
	readonly kind = 'strong';
	constructor(readonly ast: StrongAstNode, readonly content: readonly AnyViewData[]) { }
}

export class EmphasisViewData {
	readonly kind = 'emphasis';
	constructor(readonly ast: EmphasisAstNode, readonly content: readonly AnyViewData[]) { }
}

export class StrikethroughViewData {
	readonly kind = 'strikethrough';
	constructor(readonly ast: StrikethroughAstNode, readonly content: readonly AnyViewData[]) { }
}

export class InlineCodeViewData {
	readonly kind = 'inlineCode';
	constructor(readonly ast: InlineCodeAstNode, readonly content: readonly AnyViewData[]) { }
}

export class InlineMathViewData {
	readonly kind = 'inlineMath';
	constructor(
		readonly ast: InlineMathAstNode,
		/** Active: render the `$…$` source; inactive: the KaTeX output. */
		readonly showMarkup: boolean,
		readonly content: readonly AnyViewData[],
	) { }
}

export class LinkViewData {
	readonly kind = 'link';
	constructor(
		readonly ast: LinkAstNode,
		/** Active: render the Markdown source; inactive: allow a rich presentation. */
		readonly showMarkup: boolean,
		readonly content: readonly AnyViewData[],
	) { }
}

export class ImageViewData {
	readonly kind = 'image';
	constructor(
		readonly ast: ImageAstNode,
		/** Active: render the `![alt](url)` source; inactive: the `<img>`. */
		readonly showMarkup: boolean,
		readonly content: readonly AnyViewData[],
	) { }
}

// ---------------------------------------------------------------------------
// Containers without their own AST union (list item, table row/cell)
// ---------------------------------------------------------------------------

export class ListItemViewData {
	readonly kind = 'listItem';
	constructor(
		readonly ast: ListItemAstNode,
		/** Whether the selection reaches this item (reveals its markers). */
		readonly isActive: boolean,
		readonly content: readonly AnyViewData[],
		/** 1-based list nesting depth, used to size the indentation gutter. */
		readonly level: number,
		/**
		 * Whether this is an inactive task item whose first paragraph begins
		 * with the `:running:` marker (see {@link TextViewData.hiddenPrefixLength}).
		 * Always `false` while the item is active — an active/editing task
		 * reveals the literal marker instead of the progress affordance.
		 */
		readonly isRunning: boolean = false,
	) { }
}

export class TableRowViewData {
	readonly kind = 'tableRow';
	constructor(
		readonly ast: TableRowAstNode,
		readonly isDelimiter: boolean,
		readonly content: readonly AnyViewData[],
	) { }
}

export class TableCellViewData {
	readonly kind = 'tableCell';
	constructor(
		readonly ast: TableCellAstNode,
		/** Whether the selection reaches this cell (reveals its inline markers). */
		readonly isActive: boolean,
		/** Whether the owning table is active (reveals the structural pipes). */
		readonly showTableGlue: boolean,
		readonly content: readonly AnyViewData[],
	) { }
}

// ---------------------------------------------------------------------------
// Leaves
// ---------------------------------------------------------------------------

export class TextViewData {
	readonly kind = 'text';
	/**
	 * Whether non-obvious whitespace in this text is revealed (block is active).
	 * `leftWordBoundary`/`rightWordBoundary` say whether the inline sibling on
	 * that side ends/starts with visible word content (e.g. inline code, a link,
	 * emphasis); a single space touching such a sibling is obvious and stays
	 * undecorated, just like a space between two words within this leaf.
	 */
	constructor(
		readonly ast: TextAstNode,
		readonly showWhitespace: boolean,
		readonly leftWordBoundary: boolean = false,
		readonly rightWordBoundary: boolean = false,
		/**
		 * Number of leading source characters to keep out of the rendered
		 * text (but not out of the source): the `:running:` marker plus its
		 * mandatory leading separator, once
		 * {@link isRunnerMarkerText} has matched this node. Zero otherwise.
		 */
		readonly hiddenPrefixLength: number = 0,
	) { }
}

export class ThematicBreakViewData {
	readonly kind = 'thematicBreak';
	constructor(
		readonly ast: ThematicBreakAstNode,
		/** Active: reveal the source markup (`---`) instead of the rendered rule. */
		readonly showMarkup: boolean,
		/** Marker (and any absorbed trailing glue), rendered only when active. */
		readonly content: readonly AnyViewData[],
	) { }
}

export class VideoViewData {
	readonly kind = 'video';
	constructor(
		readonly ast: VideoAstNode,
		/** Active: reveal the exact HTML source; inactive: render the native video. */
		readonly showMarkup: boolean,
		readonly content: readonly AnyViewData[],
		/** Nested diff state; top-level video diff state lives on the document child. */
		readonly diffKind?: 'added' | 'modified',
	) { }
}

/**
 * View-data for an {@link UnhandledBlockAstNode}. The source remains verbatim
 * in both states. Complete HTML comments use {@link showMarkup} to switch
 * between their quiet reading treatment and editable source presentation;
 * other unhandled blocks ignore the flag and keep their warning treatment.
 */
export class UnhandledBlockViewData {
	readonly kind = 'unhandledBlock';
	constructor(
		readonly ast: UnhandledBlockAstNode,
		readonly showMarkup: boolean,
		readonly content: readonly AnyViewData[],
	) { }
}

export class MarkerViewData {
	readonly kind = 'marker';
	constructor(readonly ast: MarkerAstNode, readonly visible: boolean) { }
}

export class GlueViewData {
	readonly kind = 'glue';
	constructor(
		readonly ast: GlueAstNode,
		readonly visible: boolean,
		/**
		 * Whether a source newline in this glue gets a visible `↵`. True only in
		 * inline flow, where the newline collapses to a space and the `↵` reveals
		 * the line ending hiding there; between block-level siblings (list items,
		 * block children) the break is already visible, so no `↵` is drawn.
		 */
		readonly decorateNewline: boolean,
	) { }
}

/** A word/character highlight inside one diff side, in block-local coords. */
export interface DiffHighlightRange {
	readonly range: OffsetRange;
	readonly kind: 'inserted' | 'deleted';
}

/** One side (original or modified) of a {@link DiffHunkViewData}. */
export interface DiffSideViewData {
	readonly view: BlockViewData;
	/** Render in active form (markers/whitespace visible). */
	readonly active: boolean;
	readonly ranges: readonly DiffHighlightRange[];
}

/**
 * A changed block rendered as its original form stacked over its modified form
 * (either side may be absent for a pure deletion/insertion). It is itself a
 * document child the renderer mounts like a block; its {@link ast} is the
 * surviving side's ast, used only for view-node identity/reuse.
 */
export class DiffHunkViewData {
	readonly kind = 'diffHunk';
	constructor(
		readonly ast: AstNode,
		readonly original: DiffSideViewData | undefined,
		readonly modified: DiffSideViewData | undefined,
	) { }
}

/**
 * A read-only "removed" decoration: an original block rendered (red) above its
 * place in the modified document, occupying vertical space like a view-zone but
 * contributing **zero** source length, so the editor's source mapping stays the
 * modified document and editing is unaffected. Used for `removed` and the
 * original side of a `replaced` block in editor diff mode.
 */
export class DiffDecorationViewData {
	readonly kind = 'diffDecoration';
	constructor(
		readonly ast: AstNode,
		readonly side: BlockViewData,
		readonly deletedRanges: readonly DiffHighlightRange[],
		/** True when the whole block was removed: solid red band, no word rects. */
		readonly whole: boolean,
		/** Absolute offset of this block in the *original* document. */
		readonly originalStart: number,
	) { }
}

export type AnyViewData =
	| DocumentViewData | BlockViewData | InlineViewData
	| ListItemViewData | TableRowViewData | TableCellViewData
	| MarkerViewData | GlueViewData | DiffHunkViewData | DiffDecorationViewData;

// ---------------------------------------------------------------------------
// Builder
// ---------------------------------------------------------------------------

/** The selection-derived inputs threaded down while building one subtree. */
interface BuildCtx {
	/** Whether markers/source are revealed in this node's region. */
	readonly showMarkup: boolean;
	/** Whether `tableCellGlue` pipes are forced visible (the owning table is active). */
	readonly showTableGlue: boolean;
	/** Render every descendant video as source, independently of container activity. */
	readonly forceVideoSource?: boolean;
	/** Selection range relative to the node being built, or `undefined` when inactive. */
	readonly selectionInNode: OffsetRange | undefined;
	/**
	 * Whether the node being built lays its children out in inline flow (a
	 * paragraph, heading, table cell, or an inline wrapper). A source newline
	 * there collapses to a space and so earns a visible `↵`; in block flow the
	 * line break is already visible and the newline gets none. Defaults to false.
	 */
	readonly inlineFlow?: boolean;
	/** 1-based nesting depth of the list currently being built (0 outside lists). */
	readonly listLevel?: number;
	/** Block containing the source range replaced by a pending paragraph. */
	readonly pendingAnchorBlock?: BlockAstNode;
	/** Source range replaced by a pending paragraph, relative to {@link pendingAnchorBlock}. */
	readonly pendingReplacementInBlock?: OffsetRange;
	/**
	 * The exact {@link TextAstNode} instance (by identity) whose leading
	 * {@link hideRunnerMarkerLength} characters should be hidden from render,
	 * set by an enclosing inactive, running {@link _buildListItem} on the text
	 * node that follows its task checkbox glue. Matching by identity (rather
	 * than by position) means this can be threaded broadly through child
	 * contexts without any other text node reacting to it.
	 */
	readonly hideRunnerMarkerNode?: TextAstNode;
	/** Length to hide when a text node's identity matches {@link hideRunnerMarkerNode}. */
	readonly hideRunnerMarkerLength?: number;
}

const _INACTIVE: BuildCtx = { showMarkup: false, showTableGlue: false, selectionInNode: undefined };

/** Descend into inline flow, where a source newline collapses to a space (so its `↵` is shown). */
function _inline(ctx: BuildCtx): BuildCtx {
	return ctx.inlineFlow ? ctx : { ...ctx, inlineFlow: true };
}

/**
 * Map the parsed document + active/selection state to its view-data tree.
 *
 * Top-level blocks are mirrored into {@link DocumentViewData.blocks}. A block's
 * trailing blank lines are attributed by the parser to the block itself (a
 * `blockGap`/`blockBreak` glue at the end of its content), and a leading indent
 * to the block it precedes (its `leadingTrivia`), so both are built as part of
 * the block and revealed only when that block is active — no neighbour scan. The
 * only glue that survives at the document level is an unowned leading gap before
 * the first block; it is mirrored into {@link DocumentViewData.children} and
 * stays collapsed (never revealed), like the gap between two blocks.
 * An inactive block's view-data is a pure function of its AST, so when `previous`
 * holds a view-data for the same block object (the parser preserves identity for
 * unchanged subtrees) that was *also* inactive, the whole subtree is reused by
 * identity — the common case for a selection move, making it O(active blocks).
 */
export function buildDocumentViewData(
	doc: DocumentAstNode,
	activeBlocks: ReadonlySet<BlockAstNode>,
	selectionRange: OffsetRange | undefined,
	previous: DocumentViewData | undefined,
	pending?: {
		readonly anchorBlock: BlockAstNode;
		readonly ast: ParagraphAstNode;
		readonly replaceRange: OffsetRange;
		readonly cursorLine: VirtualCursorLine;
		readonly text: string;
	},
): DocumentViewData {
	const prevByAst = new Map<AstNode, DocumentChildViewData>();
	if (previous) {
		for (const c of previous.children) { prevByAst.set(c.view.ast, c); }
	}

	const content = doc.content;
	const blockSet = new Set<BlockAstNode>(doc.blocks);

	const blocks: DocumentBlockViewData[] = [];
	const children: DocumentChildViewData[] = [];
	let pos = 0;
	for (let i = 0; i < content.length; i++) {
		const child = content[i];
		if (blockSet.has(child as BlockAstNode)) {
			const block = child as BlockAstNode;
			const isActive = activeBlocks.has(block);
			const prev = prevByAst.get(block);
			const pendingReplacementInBlock = pending?.anchorBlock === block
				? pending.replaceRange.delta(-pos)
				: undefined;
			let view: BlockViewData;
			if (!isActive) {
				// Fast path: an unchanged block that stays inactive keeps its whole
				// subtree by identity without rebuilding anything (the O(active) case).
				view = prev && !prev.isActive && !pendingReplacementInBlock
					? prev.view as BlockViewData
					: _buildBlock(block, {
						..._INACTIVE,
						pendingAnchorBlock: pendingReplacementInBlock ? block : undefined,
						pendingReplacementInBlock,
					}, prev?.view as AnyViewData | undefined);
			} else {
				// A block can be active without the selection intersecting it (diff
				// mode forces changed blocks active to reveal markers), so only
				// compute an in-node selection when the ranges actually overlap.
				const selectionInNode = selectionRange
					&& selectionRange.endExclusive >= pos && selectionRange.start <= pos + block.length
					? new OffsetRange(
						Math.max(0, selectionRange.start - pos),
						Math.min(block.length, selectionRange.endExclusive - pos),
					)
					: undefined;
				view = _buildBlock(block, {
					showMarkup: true,
					showTableGlue: false,
					selectionInNode,
					pendingAnchorBlock: pendingReplacementInBlock ? block : undefined,
					pendingReplacementInBlock,
				}, prev?.view as AnyViewData | undefined);
			}
			blocks.push({ ast: block, absoluteStart: pos, isActive, view });
			children.push({ absoluteStart: pos, isActive, view, kind: 'block' });
			// Render the transient empty paragraph directly after its anchor. It
			// is absent from source-backed `blocks`; the view measures it separately
			// as a virtual cursor line.
			if (pending && pending.anchorBlock === block) {
				children.push({
					absoluteStart: pos + block.length,
					isActive: true,
					view: new PendingParagraphViewData(pending.ast, pending.anchorBlock, pending.cursorLine, pending.text),
					kind: 'pendingParagraph',
				});
			}
		} else if (child instanceof GlueAstNode) {
			// Any glue that survives at the document level is unowned inter-block
			// glue (a leading gap before the first block): every gap that trails a
			// block is attributed to that block by the parser, and every leading
			// indent to the block it precedes, so the only glue left here has no
			// owning block. With no owner it is never revealed — it stays collapsed
			// in both states, exactly like the gap between two blocks.
			const prev = prevByAst.get(child);
			const view = _reuseOr(prev?.view as AnyViewData | undefined, new GlueViewData(child, false, false));
			children.push({ absoluteStart: pos, isActive: false, view, kind: 'glue' });
		}
		pos += child.length;
	}
	return new DocumentViewData(doc, blocks, children);
}

function _buildBlock(block: BlockAstNode, ctx: BuildCtx, prev: AnyViewData | undefined): BlockViewData {
	return _buildNode(block, ctx, prev) as BlockViewData;
}

/**
 * Build the view-data for a single block in isolation, used by the diff
 * renderer to render the two sides of a {@link DiffHunkViewData}. `active`
 * selects the source/markers-visible form (used for changed blocks so edits to
 * markup and whitespace are visible); inactive is the normal rendered form.
 */
export function buildBlockViewData(block: AstNode, active: boolean, previous?: AnyViewData, forceVideoSource = false): BlockViewData {
	return _buildBlockViewData(block, active, forceVideoSource, previous);
}

function _buildBlockViewData(block: AstNode, active: boolean, forceVideoSource: boolean, previous?: AnyViewData): BlockViewData {
	const ctx: BuildCtx = active
		? { showMarkup: true, showTableGlue: false, selectionInNode: undefined, forceVideoSource }
		: forceVideoSource ? { ..._INACTIVE, forceVideoSource: true } : _INACTIVE;
	return _buildBlock(block as BlockAstNode, ctx, previous);
}

/**
 * Build the document view-data for a diff, rendered through the *normal* editor
 * pipeline so the modified blocks remain the real, editable blocks. It reuses
 * {@link buildDocumentViewData} for the modified document (correct glue, active
 * handling, measurement) and then inserts read-only {@link DiffDecorationViewData}
 * children for removed blocks and the original side of replaced blocks. The
 * decorations carry zero source length, so the editor's offset space is exactly
 * the modified document and editing/cursor are unaffected.
 */
/**
 * Overlay diff decorations onto an already-built document view-data.
 *
 * `base` is the normal {@link buildDocumentViewData} result for the modified
 * document (so it is built with the usual glue / active handling / measurement
 * *and* the per-frame identity reuse, which keeps editing smooth). This inserts
 * read-only {@link DiffDecorationViewData} children for removed blocks and the
 * original side of replaced blocks, and tags changed modified blocks so they
 * get the green band. Decorations carry zero source length, so the editor's
 * offset space is exactly the modified document and editing/cursor are
 * unaffected.
 */
export function applyDiffDecorations(base: DocumentViewData, diffItems: readonly DiffItem[], decorationsActive = false): DocumentViewData {
	// Index diff items by their modified-side block; collect removed originals to
	// insert before the block they precede (the next non-removed item).
	const overlay = new Map<AstNode, DiffItem>();
	const removedBefore = new Map<AstNode, RemovedItem[]>();
	let pending: RemovedItem[] = [];
	for (const item of diffItems) {
		if (item.kind === 'removed') { pending.push(item); continue; }
		const modAst = _diffModifiedAst(item);
		if (modAst) {
			if (pending.length) { removedBefore.set(modAst, pending); pending = []; }
			overlay.set(modAst, item);
		}
	}
	const removedAtEnd = pending;

	const children: DocumentChildViewData[] = [];
	const blocks: DocumentBlockViewData[] = [];
	for (const child of base.children) {
		if (child.kind !== 'block') { children.push(child); continue; }
		const blockView = child.view as BlockViewData;
		for (const rem of removedBefore.get(blockView.ast) ?? []) {
			children.push(_decorationChild(rem.node, rem.deletedLocal, child.absoluteStart, true, rem.originalStart, decorationsActive));
		}
		const item = overlay.get(blockView.ast);
		// Only show the red original when content was actually deleted. A pure
		// insertion (e.g. a trailing blank line added before a new block) renders
		// as the active modified block with a green highlight — no red duplicate.
		if (item && item.kind === 'replaced' && item.deletedLocal.length > 0) {
			children.push(_decorationChild(item.original, item.deletedLocal, child.absoluteStart, false, item.originalStart, decorationsActive));
		}
		// A changed container renders once, editable, with red decorations woven
		// in next to its changed/removed children (recursively).
		let view = item && item.kind === 'nested' ? decorateContainer(blockView, item, decorationsActive) : blockView;
		if (item?.kind === 'added') {
			view = _withVideoDiffState(view, 'added', false) as BlockViewData;
		}
		const diffKind = item?.kind === 'added' ? 'added' as const : item?.kind === 'replaced' ? 'modified' as const : undefined;
		const outChild: DocumentChildViewData = diffKind
			? { ...child, view, diffKind }
			: view !== blockView ? { ...child, view } : child;
		children.push(outChild);
		blocks.push({ ast: blockView.ast, absoluteStart: child.absoluteStart, isActive: child.isActive, view });
	}
	for (const rem of removedAtEnd) {
		children.push(_decorationChild(rem.node, rem.deletedLocal, base.ast.length, true, rem.originalStart, decorationsActive));
	}
	return new DocumentViewData(base.ast, blocks, children);
}

function _decorationChild(originalBlock: AstNode, deletedRanges: readonly DiffHighlightRange[], absoluteStart: number, whole: boolean, originalStart: number, forceActive: boolean): DocumentChildViewData {
	return {
		absoluteStart,
		isActive: false,
		view: _decoration(originalBlock, deletedRanges, whole, originalStart, forceActive),
		kind: 'diffDecoration',
	};
}

/**
 * Build the read-only original-side decoration for a removed/replaced block.
 * Partial change (`whole=false`): active/source form so marker changes show.
 * Whole removal (`whole=true`): rendered form (clean solid band) unless it is
 * a video (source avoids inert playback controls), or `forceActive` asks the
 * coverage test to render every original character.
 */
function _decoration(originalBlock: AstNode, deletedRanges: readonly DiffHighlightRange[], whole: boolean, originalStart: number, forceActive: boolean): DiffDecorationViewData {
	const active = forceActive || !whole || originalBlock.kind === 'video';
	return new DiffDecorationViewData(originalBlock, _buildBlockViewData(originalBlock, active, true), deletedRanges, whole, originalStart);
}

/**
 * Recursively overlay decorations *inside* a changed container (list, table,
 * blockquote): the modified container still renders once and editable, with a
 * read-only red {@link DiffDecorationViewData} woven in next to each changed or
 * removed child — and recursing again for a nested child container. Mirrors the
 * document-level overlay but in the container's `content` array; decorations
 * carry zero source length, so the modified offset space is unchanged.
 */
function decorateContainer(container: BlockViewData, item: NestedItem, decorationsActive: boolean): BlockViewData {
	const overlay = new Map<AstNode, DiffItem>();
	const removedBefore = new Map<AstNode, RemovedItem[]>();
	let pending: RemovedItem[] = [];
	for (const c of item.children) {
		if (c.kind === 'removed') { pending.push(c); continue; }
		const modAst = _diffModifiedAst(c);
		if (modAst) {
			if (pending.length) { removedBefore.set(modAst, pending); pending = []; }
			overlay.set(modAst, c);
		}
	}
	const content = (container as unknown as { content?: readonly AnyViewData[] }).content ?? [];
	const newContent: AnyViewData[] = [];
	for (const cvd of content) {
		for (const rem of removedBefore.get(cvd.ast) ?? []) {
			newContent.push(_decoration(rem.node, rem.deletedLocal, true, rem.originalStart, decorationsActive));
		}
		const c = overlay.get(cvd.ast);
		if (c?.kind === 'replaced') {
			if (c.deletedLocal.length > 0) {
				newContent.push(_decoration(c.original, c.deletedLocal, false, c.originalStart, decorationsActive));
			}
			newContent.push(_withVideoDiffState(cvd, 'modified', true));
		} else if (c?.kind === 'added') {
			newContent.push(_withVideoDiffState(cvd, 'added', false));
		} else if (c && c.kind === 'nested') {
			newContent.push(decorateContainer(cvd as BlockViewData, c, decorationsActive));
		} else {
			newContent.push(cvd);
		}
	}
	for (const rem of pending) {
		newContent.push(_decoration(rem.node, rem.deletedLocal, true, rem.originalStart, decorationsActive));
	}
	return _withContent(container, newContent);
}

/** Clone a view-data node with its `content` array replaced (identity differs). */
function _withContent<T extends object>(vd: T, content: readonly AnyViewData[]): T {
	return Object.assign(Object.create(Object.getPrototypeOf(vd)), vd, { content }) as T;
}

const _videoDiffStateCache = new WeakMap<AnyViewData, Map<string, AnyViewData>>();

function _withVideoDiffState(view: AnyViewData, diffKind: 'added' | 'modified', showSource: boolean): AnyViewData {
	if (
		view.kind !== 'video'
		&& view.kind !== 'blockQuote'
		&& view.kind !== 'list'
		&& view.kind !== 'listItem'
	) {
		return view;
	}
	const cacheKey = `${diffKind}:${showSource}`;
	const cached = _videoDiffStateCache.get(view)?.get(cacheKey);
	if (cached) { return cached; }

	let result: AnyViewData;
	if (view.kind === 'video') {
		const video = showSource ? buildBlockViewData(view.ast, true) : view;
		if (video.kind !== 'video') { throw new Error('Video AST must build video view data'); }
		result = new VideoViewData(video.ast, video.showMarkup, video.content, diffKind);
	} else if ('content' in view) {
		const content = view.content.map(child => _withVideoDiffState(child, diffKind, showSource));
		result = content.every((child, index) => child === view.content[index])
			? view
			: _withContent(view, content);
	} else {
		result = view;
	}

	let cache = _videoDiffStateCache.get(view);
	if (!cache) {
		cache = new Map();
		_videoDiffStateCache.set(view, cache);
	}
	cache.set(cacheKey, result);
	return result;
}

function _diffModifiedAst(item: DiffItem): AstNode | undefined {
	switch (item.kind) {
		case 'unchanged': return item.node;
		case 'added': return item.node;
		case 'replaced': return item.modified;
		case 'nested': return item.modified;
		case 'removed': return undefined;
	}
}

/**
 * Build the view-data for one node, threading the previous frame's view-data
 * for the same node so identity can be preserved bottom-up: a freshly-built
 * candidate that has the same ast, the same flags, and identity-equal children
 * as `prev` *is* `prev` (see {@link _reuseOr}). Because unchanged children are
 * already shared this way, the comparison stays O(children), and an unchanged
 * subtree keeps one stable view-data object across frames — which is exactly
 * what lets the renderer reuse its DOM by a single identity check.
 */
function _buildNode(astNode: AstNode, ctx: BuildCtx, prev: AnyViewData | undefined, neighbors?: _Neighbors): AnyViewData {
	const node = astNode as AnyAstNode;
	switch (node.kind) {
		case 'text': return _reuseOr(prev, new TextViewData(
			node, ctx.showMarkup, neighbors?.left ?? false, neighbors?.right ?? false,
			node === ctx.hideRunnerMarkerNode ? (ctx.hideRunnerMarkerLength ?? 0) : 0,
		));
		// The trailing gap is revealed as `↵` glyphs by virtue of its `blockGap`
		// kind (see `GlueViewNode`), so the break needs no inline-flow opt-in.
		case 'thematicBreak': return _reuseOr(prev, new ThematicBreakViewData(node, ctx.showMarkup, _buildChildren(node.children, ctx, prev)));
		case 'video': {
			const videoCtx = ctx.forceVideoSource && !ctx.showMarkup
				? { ...ctx, showMarkup: true }
				: ctx;
			return _reuseOr(prev, new VideoViewData(node, videoCtx.showMarkup, _buildChildren(node.children, videoCtx, prev)));
		}
		case 'unhandledBlock': return _reuseOr(prev, new UnhandledBlockViewData(node, ctx.showMarkup, _buildChildren(node.children, ctx, prev)));
		case 'marker': return _reuseOr(prev, new MarkerViewData(node, _markerVisible(node.markerKind, ctx)));
		case 'glue': return _reuseOr(prev, new GlueViewData(node, _glueVisible(node.glueKind, ctx), ctx.inlineFlow ?? false));
		case 'heading': return _reuseOr(prev, new HeadingViewData(node, _buildChildren(node.children, _inline(ctx), prev)));
		case 'paragraph': return _reuseOr(prev, new ParagraphViewData(node, _buildChildren(node.children, _inline(ctx), prev)));
		case 'frontMatter': return _reuseOr(prev, new FrontMatterViewData(node, ctx.showMarkup, _buildChildren(node.children, ctx, prev)));
		case 'codeBlock': return _reuseOr(prev, new CodeBlockViewData(node, ctx.showMarkup, _buildChildren(node.children, ctx, prev)));
		case 'mathBlock': return _reuseOr(prev, new MathBlockViewData(node, ctx.showMarkup, _buildChildren(node.children, ctx, prev)));
		case 'blockQuote': {
			const markerRange = _trailingBlockQuoteMarkerRange(node);
			const nodeOffset = ctx.pendingAnchorBlock
				? findNodeOffsetById(ctx.pendingAnchorBlock, node)
				: undefined;
			const markerRangeInBlock = markerRange && nodeOffset !== undefined
				? markerRange.delta(nodeOffset)
				: undefined;
			const showFinalMarkerOnlyLine = !markerRangeInBlock
				|| !ctx.pendingReplacementInBlock?.containsRange(markerRangeInBlock);
			return _reuseOr(prev, new BlockQuoteViewData(node, _buildChildren(node.children, ctx, prev, true), showFinalMarkerOnlyLine));
		}
		case 'list': return _reuseOr(prev, _buildList(node, ctx, prev));
		case 'listItem': return _reuseOr(prev, _buildListItem(node, ctx, prev));
		case 'table': return _reuseOr(prev, _buildTable(node, ctx, prev));
		case 'tableRow': return _reuseOr(prev, _buildTableRow(node, ctx, false, prev));
		case 'tableCell': return _reuseOr(prev, _buildTableCell(node, ctx.showMarkup, ctx.showTableGlue, ctx.selectionInNode, prev));
		case 'strong': return _reuseOr(prev, new StrongViewData(node, _buildChildren(node.children, _inline(ctx), prev)));
		case 'emphasis': return _reuseOr(prev, new EmphasisViewData(node, _buildChildren(node.children, _inline(ctx), prev)));
		case 'strikethrough': return _reuseOr(prev, new StrikethroughViewData(node, _buildChildren(node.children, _inline(ctx), prev)));
		case 'inlineCode': return _reuseOr(prev, new InlineCodeViewData(node, _buildChildren(node.children, _inline(ctx), prev)));
		case 'inlineMath': return _reuseOr(prev, new InlineMathViewData(node, ctx.showMarkup, _buildChildren(node.children, _inline(ctx), prev)));
		case 'link': return _reuseOr(prev, new LinkViewData(node, ctx.showMarkup, _buildChildren(node.children, _inline(ctx), prev)));
		case 'image': return _reuseOr(prev, new ImageViewData(node, ctx.showMarkup, _buildChildren(node.children, _inline(ctx), prev)));
		case 'document': return buildDocumentViewData(node, new Set(), OffsetRange.ofLength(0), undefined);
	}
}

/** Children of a view-data node, for identity comparison and prev-matching. */
function _childrenOf(node: AnyViewData): readonly AnyViewData[] {
	if (node.kind === 'document') { return node.blocks.map(b => b.view); }
	return 'content' in node ? node.content : _NO_CHILDREN;
}

const _NO_CHILDREN: readonly AnyViewData[] = [];

/** Index the previous node's children by their ast, so each new child finds its match. */
function _prevChildByAst(prev: AnyViewData | undefined): ReadonlyMap<AstNode, AnyViewData> | undefined {
	if (!prev) { return undefined; }
	const map = new Map<AstNode, AnyViewData>();
	for (const c of _childrenOf(prev)) { map.set(c.ast, c); }
	return map;
}

/**
 * Reuse `prev` in place of the freshly-built `cand` when the two are
 * indistinguishable: same kind, same ast, equal flags, and identity-equal
 * children (unchanged children are already shared, so this is a cheap `===`
 * sweep). Returning `prev` keeps the whole subtree's view-data object stable.
 */
function _reuseOr<T extends AnyViewData>(prev: AnyViewData | undefined, cand: T): T {
	if (prev && prev.kind === cand.kind && prev.ast === cand.ast && _flagsEqual(prev, cand)) {
		const a = _childrenOf(prev);
		const b = _childrenOf(cand);
		if (a.length === b.length && a.every((c, i) => c === b[i])) { return prev as T; }
	}
	return cand;
}

/** Compare the selection-derived flags of two same-kind view-data nodes. */
function _flagsEqual(a: AnyViewData, b: AnyViewData): boolean {
	switch (a.kind) {
		case 'text': return a.showWhitespace === (b as TextViewData).showWhitespace
			&& a.leftWordBoundary === (b as TextViewData).leftWordBoundary
			&& a.rightWordBoundary === (b as TextViewData).rightWordBoundary
			&& a.hiddenPrefixLength === (b as TextViewData).hiddenPrefixLength;
		case 'marker': return a.visible === (b as MarkerViewData).visible;
		case 'glue': return a.visible === (b as GlueViewData).visible
			&& a.decorateNewline === (b as GlueViewData).decorateNewline;
		case 'thematicBreak': return a.showMarkup === (b as ThematicBreakViewData).showMarkup;
		case 'video': return a.showMarkup === (b as VideoViewData).showMarkup
			&& a.diffKind === (b as VideoViewData).diffKind;
		case 'frontMatter': return a.showMarkup === (b as FrontMatterViewData).showMarkup;
		case 'codeBlock': return a.showMarkup === (b as CodeBlockViewData).showMarkup;
		case 'mathBlock': return a.showMarkup === (b as MathBlockViewData).showMarkup;
		case 'inlineMath': return a.showMarkup === (b as InlineMathViewData).showMarkup;
		case 'image': return a.showMarkup === (b as ImageViewData).showMarkup;
		case 'unhandledBlock': return a.showMarkup === (b as UnhandledBlockViewData).showMarkup;
		case 'listItem': return a.isActive === (b as ListItemViewData).isActive
			&& a.isRunning === (b as ListItemViewData).isRunning;
		case 'tableCell': {
			const o = b as TableCellViewData;
			return a.isActive === o.isActive && a.showTableGlue === o.showTableGlue;
		}
		case 'tableRow': return a.isDelimiter === (b as TableRowViewData).isDelimiter;
		case 'blockQuote': return a.showFinalMarkerOnlyLine === (b as BlockQuoteViewData).showFinalMarkerOnlyLine;
		default: return true;
	}
}

function _trailingBlockQuoteMarkerRange(blockQuote: BlockQuoteAstNode): OffsetRange | undefined {
	let offset = 0;
	let trailing: OffsetRange | undefined;
	for (const child of blockQuote.children) {
		if (!(child instanceof GlueAstNode)) {
			trailing = child instanceof MarkerAstNode && child.markerKind === 'blockQuoteMarker'
				? OffsetRange.ofStartAndLength(offset, child.length)
				: undefined;
		}
		offset += child.length;
	}
	return trailing;
}

/**
 * Build children against `ctx`. A blockquote opts into child-local selection
 * coordinates because it can contain lists whose item visibility depends on
 * offsets; ordinary inline containers keep their existing shared coordinates.
 */
function _buildChildren(
	children: readonly AstNode[],
	ctx: BuildCtx,
	prev: AnyViewData | undefined,
	shiftSelection: boolean = false,
): AnyViewData[] {
	const prevByAst = _prevChildByAst(prev);
	let offset = 0;
	return children.map((c, i) => {
		const neighbors = c.kind === 'text'
			? {
				left: i > 0 && _edgeIsWordContent(children[i - 1], 'end'),
				right: i < children.length - 1 && _edgeIsWordContent(children[i + 1], 'start'),
			}
			: undefined;
		const childCtx = shiftSelection && ctx.selectionInNode
			? { ...ctx, selectionInNode: ctx.selectionInNode.delta(-offset) }
			: ctx;
		const result = _buildNode(c, childCtx, prevByAst?.get(c), neighbors);
		offset += c.length;
		return result;
	});
}

interface _Neighbors { readonly left: boolean; readonly right: boolean; }

/**
 * Whether `node`'s `start`/`end` edge renders as visible word content — so a
 * single space touching it reads as an ordinary inter-word space. Inline
 * wrappers (code, math, links, images, emphasis, …) always present a visible
 * glyph at both edges; a text run depends on its own edge character.
 */
function _edgeIsWordContent(node: AstNode, side: 'start' | 'end'): boolean {
	switch (node.kind) {
		case 'text': {
			const c = (node as TextAstNode).content;
			const ch = side === 'end' ? c[c.length - 1] : c[0];
			return ch !== undefined && ch !== ' ' && ch !== '\t' && ch !== '\n' && ch !== '\r';
		}
		case 'inlineCode':
		case 'inlineMath':
		case 'link':
		case 'image':
		case 'strong':
		case 'emphasis':
		case 'strikethrough':
			return true;
		default:
			return false;
	}
}

function _markerVisible(markerKind: string, ctx: BuildCtx): boolean {
	return ctx.showMarkup || (markerKind === 'tableCellGlue' && ctx.showTableGlue);
}

function _glueVisible(glueKind: string | undefined, ctx: BuildCtx): boolean {
	return ctx.showMarkup || (glueKind === 'tableCellGlue' && ctx.showTableGlue);
}

/** Inactive task items whose first paragraph begins with this (after the mandatory
 * checkbox separator space) hide the marker from render and show a progress
 * spinner in place of the checkbox, without altering the source in any way. */
const RUNNER_MARKER_TEXT = ':running:';

/**
 * Finds the task-item text node whose rendered content should have a leading
 * `:running:` marker (and its mandatory separator whitespace) hidden, along
 * with how many leading characters to hide.
 *
 * A task item's first paragraph always starts with the checkbox source
 * (`[x]`/`[ ]`) as an unnamed glue node, immediately followed by a text node
 * holding the separator and the rest of the task text (e.g. `" Done"`). This
 * only inspects that specific text node — not any text elsewhere in the item
 * — so a `:running:` occurring later in the task (or in a nested block) is
 * left untouched.
 */
function _runnerMarkerText(item: ListItemAstNode): { text: TextAstNode; hiddenLength: number } | undefined {
	if (item.checked === undefined) { return undefined; }
	const firstBlock = item.blocks[0];
	if (!firstBlock || firstBlock.kind !== 'paragraph') { return undefined; }
	const textNode = firstBlock.content[1];
	if (!textNode || textNode.kind !== 'text') { return undefined; }
	const text = textNode.content;
	let leading = 0;
	while (leading < text.length && (text[leading] === ' ' || text[leading] === '\t')) { leading++; }
	if (!text.startsWith(RUNNER_MARKER_TEXT, leading)) { return undefined; }
	return { text: textNode, hiddenLength: leading + RUNNER_MARKER_TEXT.length };
}

/**
 * A list reveals each item's markers only when the selection reaches it, so it
 * computes which items intersect the selection and builds each with the
 * selection range shifted to its own start.
 */
function _buildList(list: ListAstNode, ctx: BuildCtx, prevNode: AnyViewData | undefined): ListViewData {
	const prevByAst = _prevChildByAst(prevNode);
	const activeItems = _activeItemIndices(list, ctx);
	const itemSet = new Set<ListItemAstNode>(list.items);
	const itemLevel = (ctx.listLevel ?? 0) + 1;
	const content: AnyViewData[] = [];
	let pos = 0;
	for (const child of list.children) {
		if (itemSet.has(child as ListItemAstNode)) {
			const item = child as ListItemAstNode;
			const isActive = activeItems.has(list.items.indexOf(item));
			const itemCtx: BuildCtx = {
				showMarkup: isActive,
				showTableGlue: false,
				selectionInNode: isActive && ctx.selectionInNode ? ctx.selectionInNode.delta(-pos) : undefined,
				listLevel: itemLevel,
				forceVideoSource: ctx.forceVideoSource,
			};
			content.push(_reuseOr(prevByAst?.get(item), _buildListItem(item, itemCtx, prevByAst?.get(item))));
		} else {
			content.push(_buildNode(child, ctx, prevByAst?.get(child)));
		}
		pos += child.length;
	}
	return new ListViewData(list, content);
}

function _buildListItem(item: ListItemAstNode, ctx: BuildCtx, prevNode: AnyViewData | undefined): ListItemViewData {
	const prevByAst = _prevChildByAst(prevNode);
	// Only an inactive item can be "running": an active/editing task always
	// shows its literal source, `:running:` included, with no spinner.
	const runnerMarker = ctx.showMarkup ? undefined : _runnerMarkerText(item);
	const isRunning = runnerMarker !== undefined;
	const runnerCtx: BuildCtx = isRunning
		? { ...ctx, hideRunnerMarkerNode: runnerMarker.text, hideRunnerMarkerLength: runnerMarker.hiddenLength }
		: ctx;
	const content: AnyViewData[] = [];
	let pos = 0;
	for (const child of item.children) {
		const childCtx: BuildCtx = runnerCtx.selectionInNode
			? { ...runnerCtx, selectionInNode: runnerCtx.selectionInNode.delta(-pos) }
			: runnerCtx;
		content.push(_buildNode(child, childCtx, prevByAst?.get(child)));
		pos += child.length;
	}
	return new ListItemViewData(item, ctx.showMarkup, content, ctx.listLevel ?? 1, isRunning);
}

/**
 * A table reveals its delimiter and structural pipes whenever any cell is
 * active, but only the cell(s) the selection reaches reveal their inline
 * markers. Each non-delimiter row gets the table-relative selection shifted to
 * its own start; the delimiter row always reveals its cells when the table is
 * active.
 */
function _buildTable(table: TableAstNode, ctx: BuildCtx, prevNode: AnyViewData | undefined): TableViewData {
	const prevByAst = _prevChildByAst(prevNode);
	const tableActive = ctx.showMarkup;
	const delimiterRow = table.delimiterRow;
	const rowSet = new Set<TableRowAstNode>(
		[table.headerRow, table.delimiterRow, ...table.bodyRows].filter((r): r is TableRowAstNode => r !== undefined),
	);

	const content: AnyViewData[] = [];
	let pos = 0;
	for (const child of table.children) {
		if (rowSet.has(child as TableRowAstNode)) {
			const row = child as TableRowAstNode;
			const isDelimiter = row === delimiterRow;
			const rowCtx: BuildCtx = {
				showMarkup: tableActive,
				showTableGlue: tableActive,
				selectionInNode: !isDelimiter && tableActive && ctx.selectionInNode
					? ctx.selectionInNode.delta(-pos)
					: undefined,
			};
			content.push(_reuseOr(prevByAst?.get(row), _buildTableRow(row, rowCtx, isDelimiter, prevByAst?.get(row))));
		} else {
			content.push(_buildNode(child, ctx, prevByAst?.get(child)));
		}
		pos += child.length;
	}
	return new TableViewData(table, content);
}

function _buildTableRow(row: TableRowAstNode, ctx: BuildCtx, isDelimiter: boolean, prevNode: AnyViewData | undefined): TableRowViewData {
	const prevByAst = _prevChildByAst(prevNode);
	const tableActive = ctx.showMarkup;
	const activeCells = isDelimiter ? undefined : _activeCellIndices(row, ctx);
	const cellSet = new Set<TableCellAstNode>(row.cells);

	const content: AnyViewData[] = [];
	let pos = 0;
	for (const child of row.children) {
		if (cellSet.has(child as TableCellAstNode)) {
			const cell = child as TableCellAstNode;
			const cellActive = isDelimiter ? tableActive : activeCells!.has(row.cells.indexOf(cell));
			const selectionInNode = cellActive && ctx.selectionInNode ? ctx.selectionInNode.delta(-pos) : undefined;
			content.push(_buildTableCell(cell, cellActive, tableActive, selectionInNode, prevByAst?.get(cell)));
		} else {
			content.push(_buildNode(child, ctx, prevByAst?.get(child)));
		}
		pos += child.length;
	}
	return new TableRowViewData(row, isDelimiter, content);
}

function _buildTableCell(
	cell: TableCellAstNode,
	isActive: boolean,
	showTableGlue: boolean,
	selectionInNode: OffsetRange | undefined,
	prevNode: AnyViewData | undefined,
): TableCellViewData {
	const cellCtx: BuildCtx = { showMarkup: isActive, showTableGlue, selectionInNode };
	return new TableCellViewData(cell, isActive, showTableGlue, _buildChildren(cell.children, _inline(cellCtx), prevNode));
}

const _EMPTY_SET: ReadonlySet<number> = new Set();

/** Indices of the list's items whose source range intersects the selection. */
function _activeItemIndices(list: ListAstNode, ctx: BuildCtx): ReadonlySet<number> {
	if (!ctx.showMarkup || !ctx.selectionInNode) { return _EMPTY_SET; }
	const sel = ctx.selectionInNode;
	if (sel.isEmpty) {
		const idx = findActiveListItemIndex(list, sel.start);
		return idx === undefined ? _EMPTY_SET : new Set([idx]);
	}
	const result = new Set<number>();
	let pos = 0;
	for (const child of list.children) {
		const itemIdx = list.items.indexOf(child as ListItemAstNode);
		if (itemIdx >= 0 && pos < sel.endExclusive && pos + child.length > sel.start) {
			result.add(itemIdx);
		}
		pos += child.length;
	}
	return result;
}

/** Indices of the row's cells whose source range intersects the selection. */
function _activeCellIndices(row: TableRowAstNode, ctx: BuildCtx): ReadonlySet<number> {
	if (!ctx.showMarkup || !ctx.selectionInNode) { return _EMPTY_SET; }
	const sel = ctx.selectionInNode;
	if (sel.isEmpty) {
		const idx = _findActiveCellIndex(row, sel.start);
		return idx === undefined ? _EMPTY_SET : new Set([idx]);
	}
	const result = new Set<number>();
	let pos = 0;
	for (const child of row.children) {
		const cellIdx = row.cells.indexOf(child as TableCellAstNode);
		if (cellIdx >= 0 && pos < sel.endExclusive && pos + child.length > sel.start) {
			result.add(cellIdx);
		}
		pos += child.length;
	}
	return result;
}

/**
 * Cell containing a collapsed cursor, or `undefined` when the cursor is outside
 * this row. A cursor on the boundary between adjacent cells activates the
 * preceding one.
 */
function _findActiveCellIndex(row: TableRowAstNode, cursorOffset: number): number | undefined {
	let pos = 0;
	for (const child of row.children) {
		const end = pos + child.length;
		const cellIdx = row.cells.indexOf(child as TableCellAstNode);
		if (cellIdx >= 0 && ((pos <= cursorOffset && cursorOffset < end) || end === cursorOffset)) {
			return cellIdx;
		}
		pos = end;
	}
	return undefined;
}
