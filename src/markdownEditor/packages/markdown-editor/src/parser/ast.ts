/**
 * Prototype AST for the incremental reconciliation design — full grammar.
 *
 * Design rules (all enforced structurally):
 *  - Every node stores exactly one ordered `content` array of its children.
 *    `children` is *computed* from it; nothing is passed in as a separate
 *    `children` param, so the two can never drift.
 *  - Syntactic glue (inter-block newlines, table pipes/padding, the whitespace
 *    micromark doesn't assign to any token) is a first-class {@link GlueAstNode} node.
 *    Each container's element type names it explicitly, e.g. `(Block | Glue)[]`,
 *    so it is impossible to forget an array may contain glue. Semantic
 *    accessors (`blocks`, `cells`, `marker`, …) filter glue out.
 *  - Structural equality is the {@link AstNode.equalsShallow} method. The
 *    generic part (kind, length, children-by-identity) lives once on the base;
 *    each node contributes only its scalar comparison via {@link AstNode._localEquals}.
 *  - `length` is cached on first access (the tree is immutable).
 */

import { OffsetRange } from '../core/offsetRange.js';
import type { StringEdit } from '../core/stringEdit.js';

let _nextNodeId = 1;
export function _resetNodeIds(): void { _nextNodeId = 1; }

export abstract class AstNode {


	abstract readonly kind: string;
	abstract get children(): readonly AstNode[];

	/**
	 * A stable identity. Every node has one: it is minted on construction and
	 * carried across edits by reconciliation, so a node that survives an edit
	 * (even with changed content) keeps the same id.
	 */
	readonly id: number = _nextNodeId++;

	/** Rebuild this node with each child replaced by `map.get(child) ?? child`. */
	abstract mapChildren(map: ReadonlyMap<AstNode, AstNode>): AstNode;

	private _length = -1;
	get length(): number {
		if (this._length < 0) {
			let sum = 0;
			for (const c of this.children) { sum += c.length; }
			this._length = sum;
		}
		return this._length;
	}

	/**
	 * True when `other` has the same content. Containers compare children *by
	 * identity* (`===`): bottom-up reconciliation substitutes reused old
	 * instances into the fresh tree first, so equal children already share
	 * instances — keeping this O(children), not O(subtree). Leaves have no
	 * children, so {@link _localEquals} is their whole comparison.
	 */
	equalsShallow(other: AstNode): boolean {
		if (this === other) { return true; }
		if (this.kind !== other.kind || this.length !== other.length) { return false; }
		if (!this._localEquals(other as this)) { return false; }
		const a = this.children;
		const b = other.children;
		if (a.length !== b.length) { return false; }
		for (let i = 0; i < a.length; i++) {
			if (a[i] !== b[i]) { return false; }
		}
		return true;
	}

	/** Compares only this node's own scalar fields (kind/length already match). */
	protected _localEquals(_other: this): boolean { return true; }

	/**
	 * A copy of this node that adopts `id`. Reconciliation uses this to carry an
	 * old identity onto a node whose content changed. Nodes are immutable value
	 * holders, so a shallow prototype copy with `id` overridden is sound.
	 */
	cloneWithId(id: number): this {
		const clone: this = Object.create(Object.getPrototypeOf(this));
		Object.assign(clone, this);
		(clone as { id: number }).id = id;
		return clone;
	}
}

const _emptyChildren: readonly AstNode[] = [];

function _mapArr<T extends AstNode>(map: ReadonlyMap<AstNode, AstNode>, arr: readonly T[]): readonly T[] {
	let out: T[] | undefined;
	for (let i = 0; i < arr.length; i++) {
		const m = map.get(arr[i]);
		if (m && m !== arr[i]) { (out ??= arr.slice())[i] = m as T; }
	}
	return out ?? arr;
}

function _mapOne<T extends AstNode>(map: ReadonlyMap<AstNode, AstNode>, n: T): T {
	const m = map.get(n);
	return (m && m !== n ? m : n) as T;
}

function _mapTrivia(map: ReadonlyMap<AstNode, AstNode>, trivia: GlueAstNode | undefined): GlueAstNode | undefined {
	return trivia ? _mapOne(map, trivia) : undefined;
}

// ---------------------------------------------------------------------------
// Leaves
// ---------------------------------------------------------------------------

abstract class LeafAstNode extends AstNode {
	abstract readonly content: string;
	get children(): readonly AstNode[] { return _emptyChildren; }
	override get length(): number { return this.content.length; }
	override mapChildren(): AstNode { return this; }
}

/** Real document text (an {@link InlineAstNode}). */
export class TextAstNode extends LeafAstNode {
	readonly kind = 'text';
	constructor(readonly content: string) { super(); }
	protected override _localEquals(o: this): boolean { return this.content === o.content; }
}

/** A semantic syntax marker (heading `#`, fences, brackets, list bullet, …). */
export class MarkerAstNode extends LeafAstNode {
	readonly kind = 'marker';
	constructor(readonly markerKind: string, readonly content: string) { super(); }
	protected override _localEquals(o: this): boolean {
		return this.markerKind === o.markerKind && this.content === o.content;
	}
}

/** Non-semantic syntactic glue: whitespace, padding, table pipes. */
export class GlueAstNode extends LeafAstNode {
	readonly kind = 'glue';
	constructor(readonly content: string, readonly glueKind?: string) { super(); }
	protected override _localEquals(o: this): boolean {
		return this.content === o.content && this.glueKind === o.glueKind;
	}
}

/**
 * A block-level node. Every block may carry a {@link leadingTrivia} glue — the
 * whitespace that precedes it on its own line (a nested list's indentation, the
 * leading space of a continued paragraph). It is owned by the block it precedes
 * (not the one it trails), so the view reveals it exactly when *this* block is
 * active, and it tiles at the block's front: {@link children} prepends it to the
 * block's own content while `content` stays the block's real payload.
 */
export abstract class BlockAstNodeBase extends AstNode {
	abstract readonly leadingTrivia?: GlueAstNode;
	/** This block with its leading trivia replaced — re-homes a leading glue onto it. */
	abstract withLeadingTrivia(trivia: GlueAstNode | undefined): BlockAstNode;
	/** Prepends {@link leadingTrivia}, if any, ahead of the block's own children. */
	protected _withLeading(own: readonly AstNode[]): readonly AstNode[] {
		return this.leadingTrivia ? [this.leadingTrivia, ...own] : own;
	}
}

export class ThematicBreakAstNode extends BlockAstNodeBase {
	readonly kind = 'thematicBreak';
	constructor(
		readonly content: readonly (MarkerAstNode | GlueAstNode)[],
		readonly leadingTrivia?: GlueAstNode,
	) { super(); }
	get children(): readonly AstNode[] { return this._withLeading(this.content); }
	get marker(): MarkerAstNode | undefined { return _marker(this.content, 'content'); }
	override mapChildren(m: ReadonlyMap<AstNode, AstNode>): AstNode { return new ThematicBreakAstNode(_mapArr(m, this.content), _mapTrivia(m, this.leadingTrivia)); }
	override withLeadingTrivia(trivia: GlueAstNode | undefined): ThematicBreakAstNode { return new ThematicBreakAstNode(this.content, trivia); }
}

// ---------------------------------------------------------------------------
// Inlines
// ---------------------------------------------------------------------------

export type InlineAstNode = TextAstNode | StrongAstNode | EmphasisAstNode | StrikethroughAstNode | InlineCodeAstNode | InlineMathAstNode | LinkAstNode | ImageAstNode;
export type InlineContentAstNode = InlineAstNode | MarkerAstNode | GlueAstNode;

function _marker(content: readonly AstNode[], kind: string): MarkerAstNode | undefined {
	return content.find((n): n is MarkerAstNode => n instanceof MarkerAstNode && n.markerKind === kind);
}

export class StrongAstNode extends AstNode {
	readonly kind = 'strong';
	constructor(
		readonly openMarker: MarkerAstNode,
		readonly content: readonly InlineContentAstNode[],
		readonly closeMarker: MarkerAstNode,
	) { super(); }
	get children(): readonly AstNode[] { return [this.openMarker, ...this.content, this.closeMarker]; }
	override mapChildren(m: ReadonlyMap<AstNode, AstNode>): AstNode {
		return new StrongAstNode(_mapOne(m, this.openMarker), _mapArr(m, this.content), _mapOne(m, this.closeMarker));
	}
}

export class EmphasisAstNode extends AstNode {
	readonly kind = 'emphasis';
	constructor(
		readonly openMarker: MarkerAstNode,
		readonly content: readonly InlineContentAstNode[],
		readonly closeMarker: MarkerAstNode,
	) { super(); }
	get children(): readonly AstNode[] { return [this.openMarker, ...this.content, this.closeMarker]; }
	override mapChildren(m: ReadonlyMap<AstNode, AstNode>): AstNode {
		return new EmphasisAstNode(_mapOne(m, this.openMarker), _mapArr(m, this.content), _mapOne(m, this.closeMarker));
	}
}

export class StrikethroughAstNode extends AstNode {
	readonly kind = 'strikethrough';
	constructor(
		readonly openMarker: MarkerAstNode,
		readonly content: readonly InlineContentAstNode[],
		readonly closeMarker: MarkerAstNode,
	) { super(); }
	get children(): readonly AstNode[] { return [this.openMarker, ...this.content, this.closeMarker]; }
	override mapChildren(m: ReadonlyMap<AstNode, AstNode>): AstNode {
		return new StrikethroughAstNode(_mapOne(m, this.openMarker), _mapArr(m, this.content), _mapOne(m, this.closeMarker));
	}
}

export class InlineCodeAstNode extends AstNode {
	readonly kind = 'inlineCode';
	constructor(readonly content: readonly (MarkerAstNode | GlueAstNode)[]) { super(); }
	get children(): readonly AstNode[] { return this.content; }
	override mapChildren(m: ReadonlyMap<AstNode, AstNode>): AstNode { return new InlineCodeAstNode(_mapArr(m, this.content)); }
}

export class InlineMathAstNode extends AstNode {
	readonly kind = 'inlineMath';
	constructor(readonly content: readonly (MarkerAstNode | GlueAstNode)[]) { super(); }
	get children(): readonly AstNode[] { return this.content; }
	override mapChildren(m: ReadonlyMap<AstNode, AstNode>): AstNode { return new InlineMathAstNode(_mapArr(m, this.content)); }
}

export class LinkAstNode extends AstNode {
	readonly kind = 'link';
	constructor(readonly url: string, readonly content: readonly InlineContentAstNode[]) { super(); }
	get children(): readonly AstNode[] { return this.content; }
	override mapChildren(m: ReadonlyMap<AstNode, AstNode>): AstNode { return new LinkAstNode(this.url, _mapArr(m, this.content)); }
	protected override _localEquals(o: this): boolean { return this.url === o.url; }
}

export class ImageAstNode extends AstNode {
	readonly kind = 'image';
	constructor(readonly alt: string, readonly url: string, readonly content: readonly (MarkerAstNode | GlueAstNode)[]) { super(); }
	get children(): readonly AstNode[] { return this.content; }
	override mapChildren(m: ReadonlyMap<AstNode, AstNode>): AstNode { return new ImageAstNode(this.alt, this.url, _mapArr(m, this.content)); }
	protected override _localEquals(o: this): boolean {
		return this.alt === o.alt && this.url === o.url;
	}
}

// ---------------------------------------------------------------------------
// Blocks
// ---------------------------------------------------------------------------

export type BlockAstNode = HeadingAstNode | ParagraphAstNode | FrontMatterAstNode | CodeBlockAstNode | MathBlockAstNode | ThematicBreakAstNode | VideoAstNode | BlockQuoteAstNode | ListAstNode | TableAstNode | UnhandledBlockAstNode;

/** The supported semantic attributes of a standalone HTML `<video>` block. */
export interface VideoAttributes {
	readonly src: string;
	readonly title?: string;
	readonly autoplay: boolean;
	readonly controls: boolean;
	readonly loop: boolean;
	readonly muted: boolean;
}

/**
 * A standalone HTML `<video>` whose source can be rendered without executing
 * arbitrary raw HTML. Its exact HTML remains in `content`, so activating the
 * block restores the original source for editing.
 */
export class VideoAstNode extends BlockAstNodeBase {
	readonly kind = 'video';
	constructor(
		readonly attributes: VideoAttributes,
		readonly content: readonly (MarkerAstNode | GlueAstNode)[],
		readonly leadingTrivia?: GlueAstNode,
	) { super(); }
	get children(): readonly AstNode[] { return this._withLeading(this.content); }
	get source(): MarkerAstNode | undefined { return _marker(this.content, 'content'); }
	override mapChildren(m: ReadonlyMap<AstNode, AstNode>): AstNode {
		return new VideoAstNode(this.attributes, _mapArr(m, this.content), _mapTrivia(m, this.leadingTrivia));
	}
	override withLeadingTrivia(trivia: GlueAstNode | undefined): VideoAstNode {
		return new VideoAstNode(this.attributes, this.content, trivia);
	}
	protected override _localEquals(o: this): boolean {
		return this.attributes.src === o.attributes.src
			&& this.attributes.title === o.attributes.title
			&& this.attributes.autoplay === o.attributes.autoplay
			&& this.attributes.controls === o.attributes.controls
			&& this.attributes.loop === o.attributes.loop
			&& this.attributes.muted === o.attributes.muted;
	}
}

interface HtmlCommentSourceBase {
	readonly leadingWhitespace: string;
	readonly opening: '<!--';
	readonly body: string;
}

/** The lossless source slices of a block HTML comment whose closer has not been typed. */
export interface OpenHtmlCommentSource extends HtmlCommentSourceBase {
	readonly kind: 'open';
}

/** The lossless source slices of a complete block HTML comment. */
export interface CompleteHtmlCommentSource extends HtmlCommentSourceBase {
	readonly kind: 'complete';
	readonly closing: '-->';
	readonly trailingWhitespace: string;
}

/** A block HTML comment, discriminated by whether its closing delimiter is present. */
export type HtmlCommentSource = OpenHtmlCommentSource | CompleteHtmlCommentSource;

/**
 * A block whose token type the parser does not understand (a setext heading or
 * any future/extension construct). Rather than dropping the
 * span — which would demote its text to invisible glue — the parser captures the
 * whole source range verbatim as a single {@link MarkerAstNode} of kind
 * `content` and records the originating micromark {@link tokenType}, so the view
 * can render it as raw, editable text with an "unhandled" affordance. Offsets
 * stay sound: `content` tiles the block's full source span exactly.
 */
export class UnhandledBlockAstNode extends BlockAstNodeBase {
	readonly kind = 'unhandledBlock';
	constructor(
		readonly tokenType: string,
		readonly content: readonly (MarkerAstNode | GlueAstNode)[],
		readonly leadingTrivia?: GlueAstNode,
	) { super(); }
	get children(): readonly AstNode[] { return this._withLeading(this.content); }
	get code(): MarkerAstNode | undefined { return _marker(this.content, 'content'); }
	/**
	 * Lossless slices when this raw HTML block starts one comment after optional
	 * whitespace. An open comment consumes the remaining source as its body. A
	 * complete comment permits only trailing whitespace after its closer.
	 */
	get htmlComment(): HtmlCommentSource | undefined {
		const source = this.code?.content;
		if (this.tokenType !== 'htmlFlow' || source === undefined) { return undefined; }

		const opening = '<!--';
		const closing = '-->';
		const openingStart = source.indexOf(opening);
		if (openingStart < 0) { return undefined; }
		const leadingWhitespace = source.slice(0, openingStart);
		if (leadingWhitespace.trim().length > 0) { return undefined; }

		const bodyStart = openingStart + opening.length;
		const closingStart = source.indexOf(closing, bodyStart);
		if (closingStart < 0) {
			return {
				kind: 'open',
				leadingWhitespace,
				opening,
				body: source.slice(bodyStart),
			};
		}
		const trailingWhitespace = source.slice(closingStart + closing.length);
		if (trailingWhitespace.trim().length > 0) { return undefined; }

		return {
			kind: 'complete',
			leadingWhitespace,
			opening,
			body: source.slice(bodyStart, closingStart),
			closing,
			trailingWhitespace,
		};
	}
	override mapChildren(m: ReadonlyMap<AstNode, AstNode>): AstNode { return new UnhandledBlockAstNode(this.tokenType, _mapArr(m, this.content), _mapTrivia(m, this.leadingTrivia)); }
	override withLeadingTrivia(trivia: GlueAstNode | undefined): UnhandledBlockAstNode { return new UnhandledBlockAstNode(this.tokenType, this.content, trivia); }
	protected override _localEquals(o: this): boolean { return this.tokenType === o.tokenType; }
}

export class HeadingAstNode extends BlockAstNodeBase {
	readonly kind = 'heading';
	constructor(
		readonly level: 1 | 2 | 3 | 4 | 5 | 6,
		readonly marker: MarkerAstNode,
		readonly content: readonly InlineContentAstNode[],
		readonly leadingTrivia?: GlueAstNode,
	) { super(); }
	get children(): readonly AstNode[] { return this._withLeading([this.marker, ...this.content]); }
	override mapChildren(m: ReadonlyMap<AstNode, AstNode>): AstNode {
		return new HeadingAstNode(this.level, _mapOne(m, this.marker), _mapArr(m, this.content), _mapTrivia(m, this.leadingTrivia));
	}
	override withLeadingTrivia(trivia: GlueAstNode | undefined): HeadingAstNode {
		return new HeadingAstNode(this.level, this.marker, this.content, trivia);
	}
	protected override _localEquals(o: this): boolean { return this.level === o.level; }
}

export class ParagraphAstNode extends BlockAstNodeBase {
	readonly kind = 'paragraph';
	constructor(readonly content: readonly InlineContentAstNode[], readonly leadingTrivia?: GlueAstNode) { super(); }
	get children(): readonly AstNode[] { return this._withLeading(this.content); }
	override mapChildren(m: ReadonlyMap<AstNode, AstNode>): AstNode { return new ParagraphAstNode(_mapArr(m, this.content), _mapTrivia(m, this.leadingTrivia)); }
	override withLeadingTrivia(trivia: GlueAstNode | undefined): ParagraphAstNode { return new ParagraphAstNode(this.content, trivia); }
}

/**
 * A leading YAML front matter block. The YAML value is intentionally opaque:
 * only the two fences and the exact source between them are modeled.
 */
export class FrontMatterAstNode extends BlockAstNodeBase {
	readonly kind = 'frontMatter';
	constructor(readonly content: readonly (MarkerAstNode | GlueAstNode)[], readonly leadingTrivia?: GlueAstNode) { super(); }
	get children(): readonly AstNode[] { return this._withLeading(this.content); }
	get openFence(): MarkerAstNode | undefined { return _marker(this.content, 'openFence'); }
	get closeFence(): MarkerAstNode | undefined { return _marker(this.content, 'closeFence'); }
	get value(): MarkerAstNode | undefined { return _marker(this.content, 'content'); }
	override mapChildren(m: ReadonlyMap<AstNode, AstNode>): AstNode { return new FrontMatterAstNode(_mapArr(m, this.content), _mapTrivia(m, this.leadingTrivia)); }
	override withLeadingTrivia(trivia: GlueAstNode | undefined): FrontMatterAstNode { return new FrontMatterAstNode(this.content, trivia); }
}

export class CodeBlockAstNode extends BlockAstNodeBase {
	readonly kind = 'codeBlock';
	private _previous?: WeakRef<CodeBlockAstNode>;
	private _contentEdit?: StringEdit;
	constructor(
		/** First token of the fenced code block info string, used for syntax highlighting. */
		readonly language: string,
		/** Complete fenced code block info string, including metadata after the language token. */
		readonly infoString: string,
		readonly content: readonly (MarkerAstNode | GlueAstNode)[],
		readonly leadingTrivia?: GlueAstNode,
	) { super(); }
	get children(): readonly AstNode[] { return this._withLeading(this.content); }
	get openFence(): MarkerAstNode | undefined { return _marker(this.content, 'openFence'); }
	get closeFence(): MarkerAstNode | undefined { return _marker(this.content, 'closeFence'); }
	get code(): MarkerAstNode | undefined { return _marker(this.content, 'content'); }

	/** Relative start offset of the {@link code} marker within this block. */
	get codeOffset(): number {
		let pos = this.leadingTrivia?.length ?? 0;
		for (const c of this.content) { if (c.kind === 'marker' && (c as MarkerAstNode).markerKind === 'content') { return pos; } pos += c.length; }
		return pos;
	}

	override mapChildren(m: ReadonlyMap<AstNode, AstNode>): AstNode { return new CodeBlockAstNode(this.language, this.infoString, _mapArr(m, this.content), _mapTrivia(m, this.leadingTrivia)); }
	override withLeadingTrivia(trivia: GlueAstNode | undefined): CodeBlockAstNode { return new CodeBlockAstNode(this.language, this.infoString, this.content, trivia); }
	protected override _localEquals(o: this): boolean { return this.language === o.language && this.infoString === o.infoString; }

	/**
	 * A copy of this block carrying an incremental link to `previous`:
	 * `contentEdit` (in the block's *content* coordinates) turns `previous`'s
	 * content into this one. Uses a weak reference so the previous tree can be
	 * garbage-collected.
	 */
	withCodeDiff(previous: CodeBlockAstNode, contentEdit: StringEdit): CodeBlockAstNode {
		const clone = this.cloneWithId(this.id) as CodeBlockAstNode;
		clone._previous = new WeakRef(previous);
		clone._contentEdit = contentEdit;
		return clone;
	}

	/**
	 * When this block was incrementally derived from `previous` (same
	 * fences/language, edit entirely within the content), returns the
	 * content-coordinate edit; otherwise `undefined`.
	 */
	getDiff(previous: CodeBlockAstNode): CodeBlockDiff | undefined {
		if (this._contentEdit && this._previous?.deref() === previous) {
			return { stringEdit: this._contentEdit };
		}
		return undefined;
	}
}

/**
 * Describes how a {@link CodeBlockAstNode} was incrementally derived from a previous
 * one: {@link stringEdit} (in the block's *content* coordinates) turns the
 * previous content into this one.
 */
export interface CodeBlockDiff {
	readonly stringEdit: StringEdit;
}

export class MathBlockAstNode extends BlockAstNodeBase {
	readonly kind = 'mathBlock';
	constructor(readonly content: readonly (MarkerAstNode | GlueAstNode)[], readonly leadingTrivia?: GlueAstNode) { super(); }
	get children(): readonly AstNode[] { return this._withLeading(this.content); }
	get code(): MarkerAstNode | undefined { return _marker(this.content, 'content'); }
	override mapChildren(m: ReadonlyMap<AstNode, AstNode>): AstNode { return new MathBlockAstNode(_mapArr(m, this.content), _mapTrivia(m, this.leadingTrivia)); }
	override withLeadingTrivia(trivia: GlueAstNode | undefined): MathBlockAstNode { return new MathBlockAstNode(this.content, trivia); }
}

export class BlockQuoteAstNode extends BlockAstNodeBase {
	readonly kind = 'blockQuote';
	constructor(readonly content: readonly (MarkerAstNode | BlockAstNode | GlueAstNode)[], readonly leadingTrivia?: GlueAstNode) { super(); }
	get children(): readonly AstNode[] { return this._withLeading(this.content); }
	get blocks(): readonly BlockAstNode[] { return this.content.filter(_isBlock); }
	override mapChildren(m: ReadonlyMap<AstNode, AstNode>): AstNode { return new BlockQuoteAstNode(_mapArr(m, this.content), _mapTrivia(m, this.leadingTrivia)); }
	override withLeadingTrivia(trivia: GlueAstNode | undefined): BlockQuoteAstNode { return new BlockQuoteAstNode(this.content, trivia); }
}

export class ListAstNode extends BlockAstNodeBase {
	readonly kind = 'list';
	constructor(readonly ordered: boolean, readonly content: readonly (ListItemAstNode | GlueAstNode)[], readonly leadingTrivia?: GlueAstNode) { super(); }
	get children(): readonly AstNode[] { return this._withLeading(this.content); }
	get items(): readonly ListItemAstNode[] { return this.content.filter((n): n is ListItemAstNode => n instanceof ListItemAstNode); }
	override mapChildren(m: ReadonlyMap<AstNode, AstNode>): AstNode { return new ListAstNode(this.ordered, _mapArr(m, this.content), _mapTrivia(m, this.leadingTrivia)); }
	override withLeadingTrivia(trivia: GlueAstNode | undefined): ListAstNode { return new ListAstNode(this.ordered, this.content, trivia); }
	protected override _localEquals(o: this): boolean { return this.ordered === o.ordered; }
}

export class ListItemAstNode extends AstNode {
	readonly kind = 'listItem';
	constructor(
		readonly marker: MarkerAstNode,
		readonly content: readonly (BlockAstNode | GlueAstNode)[],
		readonly checked?: boolean,
		readonly leadingTrivia?: GlueAstNode,
	) { super(); }
	get children(): readonly AstNode[] {
		return this.leadingTrivia ? [this.leadingTrivia, this.marker, ...this.content] : [this.marker, ...this.content];
	}
	get blocks(): readonly BlockAstNode[] { return this.content.filter(_isBlock); }
	override mapChildren(m: ReadonlyMap<AstNode, AstNode>): AstNode {
		return new ListItemAstNode(
			_mapOne(m, this.marker),
			_mapArr(m, this.content),
			this.checked,
			this.leadingTrivia ? _mapOne(m, this.leadingTrivia) : undefined,
		);
	}
	withLeadingTrivia(trivia: GlueAstNode | undefined): ListItemAstNode {
		return new ListItemAstNode(this.marker, this.content, this.checked, trivia);
	}
	protected override _localEquals(o: this): boolean { return this.checked === o.checked; }
}

export class TableAstNode extends BlockAstNodeBase {
	readonly kind = 'table';
	constructor(readonly content: readonly (TableRowAstNode | GlueAstNode)[], readonly leadingTrivia?: GlueAstNode) { super(); }
	get children(): readonly AstNode[] { return this._withLeading(this.content); }
	private get _rows(): readonly TableRowAstNode[] { return this.content.filter((n): n is TableRowAstNode => n instanceof TableRowAstNode); }
	get headerRow(): TableRowAstNode | undefined { return this._rows[0]; }
	get delimiterRow(): TableRowAstNode | undefined { return this._rows[1]; }
	get bodyRows(): readonly TableRowAstNode[] { return this._rows.slice(2); }
	override mapChildren(m: ReadonlyMap<AstNode, AstNode>): AstNode { return new TableAstNode(_mapArr(m, this.content), _mapTrivia(m, this.leadingTrivia)); }
	override withLeadingTrivia(trivia: GlueAstNode | undefined): TableAstNode { return new TableAstNode(this.content, trivia); }
}

export class TableRowAstNode extends AstNode {
	readonly kind = 'tableRow';
	constructor(readonly content: readonly (TableCellAstNode | GlueAstNode)[]) { super(); }
	get children(): readonly AstNode[] { return this.content; }
	get cells(): readonly TableCellAstNode[] { return this.content.filter((n): n is TableCellAstNode => n instanceof TableCellAstNode); }
	override mapChildren(m: ReadonlyMap<AstNode, AstNode>): AstNode { return new TableRowAstNode(_mapArr(m, this.content)); }
}

export class TableCellAstNode extends AstNode {
	readonly kind = 'tableCell';
	constructor(readonly content: readonly (InlineAstNode | MarkerAstNode | GlueAstNode)[]) { super(); }
	get children(): readonly AstNode[] { return this.content; }
	override mapChildren(m: ReadonlyMap<AstNode, AstNode>): AstNode { return new TableCellAstNode(_mapArr(m, this.content)); }
}

export class DocumentAstNode extends AstNode {
	readonly kind = 'document';
	constructor(readonly content: readonly (BlockAstNode | GlueAstNode)[]) { super(); }
	get children(): readonly AstNode[] { return this.content; }
	get blocks(): readonly BlockAstNode[] { return this.content.filter(_isBlock); }
	override mapChildren(m: ReadonlyMap<AstNode, AstNode>): AstNode { return new DocumentAstNode(_mapArr(m, this.content)); }
}

function _isBlock(n: AstNode): n is BlockAstNode {
	return n instanceof HeadingAstNode || n instanceof ParagraphAstNode || n instanceof FrontMatterAstNode || n instanceof CodeBlockAstNode
		|| n instanceof MathBlockAstNode || n instanceof ThematicBreakAstNode || n instanceof VideoAstNode || n instanceof BlockQuoteAstNode
		|| n instanceof ListAstNode || n instanceof TableAstNode || n instanceof UnhandledBlockAstNode;
}
// ---------------------------------------------------------------------------
// Public helpers
// ---------------------------------------------------------------------------

/** Every concrete node kind, for exhaustive consumer-side dispatch. */
export type AnyAstNode =
	| TextAstNode | MarkerAstNode | GlueAstNode | ThematicBreakAstNode
	| StrongAstNode | EmphasisAstNode | StrikethroughAstNode | InlineCodeAstNode | InlineMathAstNode | LinkAstNode | ImageAstNode
	| HeadingAstNode | ParagraphAstNode | FrontMatterAstNode | CodeBlockAstNode | MathBlockAstNode | VideoAstNode | BlockQuoteAstNode | ListAstNode | ListItemAstNode
	| TableAstNode | TableRowAstNode | TableCellAstNode | DocumentAstNode | UnhandledBlockAstNode;

/**
 * Source offset (relative to `root`) of the node with `target`'s id, or
 * `undefined` when it is not in the tree. Ids are stable across edits, so this
 * locates a node even after reconciliation has rebuilt the tree around it.
 */
export function findNodeOffsetById(root: AstNode, target: AstNode): number | undefined {
	if (root.id === target.id) { return 0; }
	let pos = 0;
	for (const child of root.children) {
		const inner = findNodeOffsetById(child, target);
		if (inner !== undefined) { return pos + inner; }
		pos += child.length;
	}
	return undefined;
}

const _TASK_CHECKBOX_RE = /\[[ xX]\]/;

/**
 * Source range (relative to `item`) of a task list item's `[x]`/`[ ]`
 * checkbox, or `undefined` when the item is not a task item. The checkbox is
 * plain glue in the AST, so a host that wants to toggle it locates the literal
 * `[x]`/`[ ]` token here.
 */
export function taskCheckboxRange(item: ListItemAstNode): OffsetRange | undefined {
	if (item.checked === undefined) { return undefined; }
	const match = _TASK_CHECKBOX_RE.exec(_nodeText(item));
	if (!match) { return undefined; }
	return OffsetRange.ofStartAndLength(match.index, match[0].length);
}

/** Source text of a node, reconstructed from its leaf content. */
function _nodeText(node: AstNode): string {
	if (node instanceof LeafAstNode) { return node.content; }
	let text = '';
	for (const child of node.children) { text += _nodeText(child); }
	return text;
}
