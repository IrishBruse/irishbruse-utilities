import katex from 'katex';
import { transaction, runOnChange } from '@vscode/observables';
import type { IDisposable, IObservable } from '@vscode/observables';
import { OffsetRange } from '../../core/offsetRange.js';
import type { AstNode, BlockAstNode, BlockQuoteAstNode, HtmlCommentSource, ListItemAstNode } from '../../parser/ast.js';
import { CodeBlockAstNode, GlueAstNode, MarkerAstNode } from '../../parser/ast.js';
import { StringEdit, StringReplacement } from '../../core/stringEdit.js';
import type {
	AnyViewData, CodeBlockViewData, DiffDecorationViewData, DiffHighlightRange, DiffHunkViewData, DiffSideViewData, GlueViewData, HeadingViewData, ImageViewData,
	FrontMatterViewData, InlineCodeViewData, InlineMathViewData, LinkViewData, ListViewData, ListItemViewData,
	MarkerViewData, MathBlockViewData, TableRowViewData, TableViewData, TextViewData, ThematicBreakViewData, UnhandledBlockViewData, VideoViewData,
} from '../viewData.js';
import type { ISyntaxHighlighter, ISyntaxHighlighterDocument, Token } from '../../highlighter/syntaxHighlighter.js';
import { patchDomNodes } from './dom.js';
import { getEmbeddedCodeBlockContent } from './embeddedCodeBlockContent.js';
import {
	RichLink,
	type LinkPresentation,
} from './richLink.js';
import { ViewNode } from './viewNode.js';

export interface BlockViewOptions {
	readonly renderCustomCodeBlock?: (language: string, content: string) => HTMLElement | undefined;
	readonly onToggleCheckbox?: (item: ListItemAstNode, newChecked: boolean) => void;
	/** Temporarily yields the host editor's text input while a nested control owns focus. */
	readonly suspendEditContextWhileFocused?: (element: HTMLElement) => IDisposable;
	/**
	 * Supplies live, declarative metadata for recognized links. The editor owns
	 * the markup and styling; providers own lookup, caching, and updates.
	 */
	readonly linkPresentationProvider?: ILinkPresentationProvider;
	/**
	 * Opens a link's URL. Called when the user activates a link: a plain click
	 * while the link's block is inactive (rendered), or a Ctrl/Cmd+click while it
	 * is active (source shown). Return `false` to use the anchor's native
	 * navigation behavior.
	 */
	readonly onOpenLink?: (url: string, event: MouseEvent) => false | void;
	/**
	 * Colours fenced code blocks. When set, a code block's content is rendered
	 * as a sequence of token spans instead of one plain text node. This is the
	 * non-incremental path: the snapshot is read once at render time.
	 */
	readonly syntaxHighlighter?: ISyntaxHighlighter;
	/**
	 * Pluggable renderer for the *inactive* (rendered) form of a math node —
	 * both `$$…$$` blocks and inline `$…$`. When set and it returns a result,
	 * its {@link MathRendering.dom} replaces the default opaque `katex.render`
	 * output, and its {@link MathRendering.segments} let parts of the rendered
	 * math (e.g. individual identifier glyphs) map back to source ranges so the
	 * caret can land inside them. Returning `undefined` falls back to the
	 * default whole-node KaTeX leaf. The active (source) form is unaffected.
	 *
	 * This is the seam used to explore in-place editing of rendered math (see
	 * `katexEditableIdentifiers.ts`).
	 */
	readonly renderMath?: (request: MathRenderRequest) => MathRendering | undefined;

	/**
	 * Pluggable factory for an in-place, interactive editor that replaces the
	 * *rendered* (inactive) form of a fenced code block — see
	 * {@link IEmbeddedCodeEditor}. When it returns an editor for the block's
	 * language, that editor's element is mounted instead of the highlighted
	 * code, and content flows both ways as string edits. Returning `undefined`
	 * falls back to the default rendering. EXPERIMENTAL.
	 */
	readonly embeddedCodeEditorFactory?: IEmbeddedCodeEditorFactory;
	/** Current read-only state forwarded to embedded code editors. */
	readonly embeddedCodeEditorReadOnly?: boolean;
	/** Identity used to invalidate previously created embedded editors. */
	readonly embeddedCodeEditorFactoryVersion?: unknown;

	/**
	 * Called when an {@link IEmbeddedCodeEditor} edits its content. `contentEdit`
	 * is in the block's *content* coordinates; the host translates it to a
	 * document edit (via {@link CodeBlockAstNode.codeOffset} and the block's
	 * offset) and applies it to the model.
	 */
	readonly onEmbeddedCodeEditorEdit?: (block: CodeBlockAstNode, contentEdit: StringEdit) => void;
}

export interface ILinkPresentationProvider {
	/**
	 * Returns `undefined` for unsupported links. The caller disposes the returned
	 * reference when the rendered link disappears.
	 */
	createLinkPresentation(url: string): ILinkPresentation | undefined;
}

export interface ILinkPresentation extends IDisposable {
	/** Current presentation, updated without rebuilding the editor. */
	readonly presentation: IObservable<LinkPresentation | undefined>;
}

export type {
	LinkPresentation,
	LinkPresentationKind,
	LinkPresentationStatus,
	LinkPresentationStatusKind,
} from './richLink.js';

/**
 * A live editor embedded in place of a fenced code block's *rendered* form.
 *
 * This is the internal seam between the block view and a concrete embedded
 * editor (e.g. an `<iframe>` speaking the web-editor protocol). The block view
 * only speaks string edits: it pushes the block's content down via
 * {@link setContent} and receives the editor's own changes back through
 * {@link onEdit} (set by the block view on each (re)construction, so it always
 * routes to the current AST node). The concrete implementation owns its DOM,
 * transport, and lifecycle.
 *
 * A single instance is adopted across re-renders (like the highlighter session)
 * so the underlying editor keeps its state across edits — see
 * {@link CodeBlockViewNode}.
 */
export interface IEmbeddedCodeEditor {
	/** The element mounted as the block's rendered form. */
	readonly element: HTMLElement;
	/**
	 * Document → editor. The block's content changed (from any source). Must be
	 * idempotent: pushing the content the editor already holds is a no-op, which
	 * is how edits the editor itself originated are prevented from echoing back.
	 */
	setContent(content: string): void;
	/** Update whether the embedded editor may change its content. */
	setReadOnly?(readOnly: boolean): void;
	/**
	 * Optional synchronous height (px) to reserve for `content` *before* the
	 * editor has laid out. Return `undefined` to let the editor size itself
	 * (the implementation may report its real height later). Lets a registration
	 * avoid a layout jump when it can cheaply estimate the size from content.
	 */
	estimateHeight?(content: string): number | undefined;
	/**
	 * Editor → document. Set by the block view on every (re)construction to
	 * route the editor's own edits, expressed in the block's *content*
	 * coordinates, to the current AST node.
	 */
	onEdit?: (edit: StringEdit) => void;
	dispose(): void;
}

/** Creates an {@link IEmbeddedCodeEditor} for a fenced block, or opts out. */
export interface IEmbeddedCodeEditorFactory {
	/**
	 * Return an editor for a fenced block, or `undefined` to fall
	 * back to the default (highlighting / {@link BlockViewOptions.renderCustomCodeBlock}).
	 */
	create(language: string, infoString: string, initialContent: string): IEmbeddedCodeEditor | undefined;
}

/** Input to a {@link BlockViewOptions.renderMath} renderer. */
export interface MathRenderRequest {
	/** The LaTeX source of the math content (without the `$$`/`$` fences). */
	readonly latex: string;
	/** `true` for a `$$…$$` block, `false` for inline `$…$`. */
	readonly displayMode: boolean;
	/** CSS class the host element must carry (editor styling/measurement hooks). */
	readonly className: string;
	/** Full source length of the math node (fences/`$` included). */
	readonly nodeLength: number;
	/** Offset of {@link latex} within the node (i.e. after the opening fence/`$`). */
	readonly contentStart: number;
}

/**
 * A span of the rendered math output that maps to a slice of source. The
 * renderer reports these for the parts it can map (e.g. identifier glyphs);
 * the editor tiles the gaps between them so the whole math node stays mapped.
 */
export interface MathSourceSegment {
	/** A DOM node (ideally a Text node) within the rendered output. */
	readonly dom: globalThis.Node;
	/** Start offset of the mapped slice, relative to the math node's start. */
	readonly start: number;
	/** Source length of the mapped slice. */
	readonly length: number;
}

/** Result of a {@link BlockViewOptions.renderMath} renderer. */
export interface MathRendering {
	/** Host element to mount (the rendered math output). */
	readonly dom: HTMLElement;
	/** Source-mapped spans within {@link dom} (need not tile the whole node). */
	readonly segments: readonly MathSourceSegment[];
}

/**
 * Base view node for everything the editor renders, generic over the
 * {@link AnyViewData view-data} it renders so subclasses get a precisely-typed
 * {@link data} (e.g. `BlockViewNode<HeadingViewData>`). Every view-data kind has
 * a subclass whose constructor builds the node's DOM and, recursively,
 * constructs its child view nodes — so *constructing a node is rendering it*.
 * There is no separate render pass: the view tree is the result of construction,
 * and {@link createViewNode} is the single entry point that turns a `ViewData`
 * into a node (reusing a `previous` node untouched when it still matches).
 *
 * The name is historical — it is the base for inline and leaf nodes too — but
 * top-level blocks are always instances of it, and {@link element}/{@link block}
 * are the conveniences {@link EditorView} uses for those.
 */
export class BlockViewNode<T extends AnyViewData = AnyViewData> extends ViewNode {
	constructor(
		readonly data: T,
		dom: globalThis.Node,
		children: readonly ViewNode[],
	) {
		super(data.ast, dom, children);
	}

	get block(): BlockAstNode { return this.data.ast as BlockAstNode; }
	get element(): HTMLElement { return this.dom as HTMLElement; }

	/**
	 * The horizontal scroll viewport for selection/caret clipping
	 * ({@link blockViewportClip}). For most blocks the scroller *is*
	 * {@link element} — a code / math / unhandled block's `element` is the very
	 * `overflow-x: auto` box that scrolls. A table is the exception: its
	 * `element` stays the inner `<table>` (so the active/markers classes and
	 * `.md-table` theme styling are unaffected), but the box that actually
	 * scrolls is the wrapping `.md-table-wrapper`, so {@link TableViewNode}
	 * overrides this to return that wrapper.
	 */
	get scrollElement(): HTMLElement { return this.element; }

	/**
	 * Whether this already-built node can stand in for `data` unchanged. The
	 * builder preserves view-data identity for any subtree whose ast and
	 * selection-derived flags are unchanged (see `buildDocumentViewData`), so a
	 * single identity check captures "nothing in my subtree changed" — and its
	 * whole subtree, and any session it owns, are kept as-is.
	 */
	canReuse(data: AnyViewData, _options: BlockViewOptions | undefined): boolean {
		return this.data === data;
	}

	/**
	 * Called by the view after this block is mounted and measured, with the
	 * block's rendered height in px. The default is a no-op; subclasses whose
	 * active/inactive renderings have different intrinsic heights (e.g. a math
	 * block) override this to remember a height to reserve across the toggle.
	 */
	recordMeasuredHeight(_height: number): void { /* no-op */ }
}

/**
 * Turn a {@link AnyViewData view-data} node into its view node, reusing
 * `previous` when it still renders the very same view-data object (see
 * {@link BlockViewNode.canReuse}). Otherwise the matching subclass is
 * constructed, which renders it and recursively constructs its children —
 * threading `previous` down so an edited node can adopt its predecessor's DOM
 * (and, for an edited {@link CodeBlockAstNode}, the highlighting session of the
 * node it was derived from).
 *
 * On a rebuild `previous` is the view node {@link pairNodes} paired by stable id:
 * identity-matched nodes (same view-data) short-circuit above, an edited node is
 * paired with the node carrying its previous id, and any previous node whose id
 * is gone is dropped (disposed by its container's reconcile) so its replacement
 * is built with `previous === undefined`.
 */
export function createViewNode(data: AnyViewData, options: BlockViewOptions | undefined, previous?: ViewNode): ViewNode {
	if (previous instanceof BlockViewNode) {
		if (previous.canReuse(data, options)) {
			return previous;
		}
	} else if (previous?.ast === data.ast) {
		return previous;
	}

	switch (data.kind) {
		case 'text': return _textLeaf(data, _prev(previous, LeafViewNode));
		case 'marker': return data.ast.markerKind === 'hardBreak'
			? new HardBreakViewNode(data, _prev(previous, HardBreakViewNode))
			: new MarkerViewNode(data, _prev(previous, MarkerViewNode));
		case 'glue': return data.ast.glueKind === 'blockQuoteLineBreak'
			? new BlockQuoteLineBreakViewNode(data, _prev(previous, BlockQuoteLineBreakViewNode))
			: new GlueViewNode(data, _prev(previous, GlueViewNode));
		case 'heading': return new HeadingViewNode(data, options, _prev(previous, HeadingViewNode));
		case 'paragraph': return new ContainerViewNode(data, 'p', 'md-block md-paragraph', options, _prevContainer(previous));
		case 'frontMatter': return new FrontMatterViewNode(data, options, _prev(previous, FrontMatterViewNode));
		case 'codeBlock': return new CodeBlockViewNode(data, options, previous);
		case 'mathBlock': return new MathBlockViewNode(data, options, _prev(previous, MathBlockViewNode));
		case 'thematicBreak': return new ThematicBreakViewNode(data, options, _prev(previous, ThematicBreakViewNode));
		case 'video': return new VideoViewNode(data, options, _prev(previous, VideoViewNode));
		case 'unhandledBlock': {
			const htmlComment = data.ast.htmlComment;
			return htmlComment
				? new HtmlCommentViewNode(data, htmlComment, options, _prev(previous, HtmlCommentViewNode))
				: new UnhandledBlockViewNode(data, options, _prev(previous, UnhandledBlockViewNode));
		}
		case 'blockQuote': return new BlockQuoteViewNode(data, options, _prev(previous, BlockQuoteViewNode));
		case 'list': return new ListViewNode(data, options, _prev(previous, ListViewNode));
		case 'listItem': return new ListItemViewNode(data, options, _prev(previous, ListItemViewNode));
		case 'table': return new TableViewNode(data, options, _prev(previous, TableViewNode));
		case 'tableRow': return new TableRowViewNode(data, options, _prev(previous, TableRowViewNode));
		case 'tableCell': return new ContainerViewNode(data, 'td', '', options, _prevContainer(previous));
		case 'strong': return new ContainerViewNode(data, 'strong', '', options, _prevContainer(previous));
		case 'emphasis': return new ContainerViewNode(data, 'em', '', options, _prevContainer(previous));
		case 'strikethrough': return new ContainerViewNode(data, 'del', '', options, _prevContainer(previous));
		case 'inlineCode': return new InlineCodeViewNode(data, options, _prev(previous, InlineCodeViewNode));
		case 'inlineMath': return new InlineMathViewNode(data, options, _prev(previous, InlineMathViewNode));
		case 'link': return new LinkViewNode(data, options, _prev(previous, LinkViewNode));
		case 'image': return new ImageViewNode(data, options, _prev(previous, ImageViewNode));
		case 'document': return new ContainerViewNode(data, 'div', '', options, _prevContainer(previous));
		case 'diffHunk': return new DiffHunkViewNode(data, options, _prev(previous, DiffHunkViewNode));
		case 'diffDecoration': return new DiffDecorationViewNode(data, options, _prev(previous, DiffDecorationViewNode));
	}
}

/** Narrow `previous` to a specific view-node subclass, or `undefined`. */
function _prev<V extends ViewNode>(previous: ViewNode | undefined, ctor: new (...args: never[]) => V): V | undefined {
	return previous instanceof ctor ? previous : undefined;
}

/** Narrow `previous` to a {@link ContainerViewNode}, or `undefined`. */
function _prevContainer(previous: ViewNode | undefined): ContainerViewNode | undefined {
	return previous instanceof ContainerViewNode ? previous : undefined;
}

/**
 * Build the view children for `childData` and patch `parentDom`'s child DOM in
 * place to match, in one step. Each new child-data is paired with the previous
 * view child that should render it ({@link pairNodes}) — by stable node id, which
 * covers both unchanged subtrees and edited nodes — so DOM and session adoption
 * carry over; the
 * `build` callback turns `(childData, prev)` into its view node (usually via
 * {@link createViewNode}). Previous children left unpaired are disposed, then
 * {@link _patchDomChildren} reorders/inserts/removes `parentDom`'s children so
 * the DOM matches the new view nodes — moving reused child DOM into place
 * rather than re-creating it. The returned array mirrors `childData` 1:1,
 * preserving the source ↔ DOM mapping invariant.
 */
export function reconcileDomChildren(
	parentDom: globalThis.Node,
	childData: readonly AnyViewData[],
	previousChildren: readonly ViewNode[] | undefined,
	build: (childData: AnyViewData, prev: ViewNode | undefined) => ViewNode,
): ViewNode[] {
	const { paired, unused } = pairNodes(childData, previousChildren ?? _NO_CHILDREN);
	const children = childData.map(d => build(d, paired.get(d)));
	for (const u of unused) { u.dispose(); }
	_patchDomChildren(parentDom, children);
	return children;
}

/**
 * Make `parent`'s child DOM nodes match `children`'s {@link ViewNode.mountNode}s
 * in order. The overwhelmingly common case — the DOM is already correct (a
 * no-op frame, or a rebuild that only reused nodes) — is detected by a linear
 * scan up front and returns without touching the DOM at all. Otherwise it
 * reorders/inserts/removes in place from where they first diverge: only nodes
 * that actually move are touched, so a node the selection lives in is left
 * attached and the cursor survives (a `replaceChildren` swap would detach every
 * child and collapse the selection).
 */
function _patchDomChildren(parent: globalThis.Node, children: readonly ViewNode[]): void {
	_patchDomNodes(parent, children.map(c => c.mountNode));
}

/**
 * Like {@link _patchDomChildren} but over raw mount nodes, so a caller can mount
 * a mix of view-node DOM and synthetic wrappers (e.g. a list item's gutter
 * span) in place without detaching the nodes that stay put.
 */
export const _patchDomNodes = patchDomNodes;

/** Default child builder: render each child-data, threading `prev`. */
function _buildChild(options: BlockViewOptions | undefined): (childData: AnyViewData, prev: ViewNode | undefined) => ViewNode {
	return (childData, prev) => createViewNode(childData, options, prev);
}

/**
 * Child builder for inline containers whose `content` marker must be a bare
 * Text node (no wrapping `<span>`), e.g. inline code / math: the content is
 * rendered as a {@link LeafViewNode} over a Text node so its characters map
 * directly. Every other child renders normally.
 */
function _inlineChild(options: BlockViewOptions | undefined): (childData: AnyViewData, prev: ViewNode | undefined) => ViewNode {
	return (childData, prev) => {
		if (childData.kind === 'marker' && childData.ast.markerKind === 'content') {
			return new LeafViewNode(childData, document.createTextNode(childData.ast.content));
		}
		return createViewNode(childData, options, prev);
	};
}

const _NO_CHILDREN: readonly ViewNode[] = [];

/**
 * Renders a {@link DiffHunkViewData}: the original block stacked over the
 * modified block (either side optional). Each side is a normal block view node
 * — the same renderers the editor uses — wrapped in a container and tagged with
 * `md-diff-original` / `md-diff-modified` so CSS can tint it. The per-side
 * word-level highlight {@link DiffHunkViewNode.sides ranges} are painted
 * separately (via the CSS Custom Highlight API) by the diff view.
 */
export class DiffHunkViewNode extends BlockViewNode<DiffHunkViewData> {
	private readonly _originalNode?: ViewNode;
	private readonly _modifiedNode?: ViewNode;

	constructor(data: DiffHunkViewData, options: BlockViewOptions | undefined, previous?: DiffHunkViewNode) {
		const wrapper = (previous?.dom as HTMLElement | undefined) ?? document.createElement('div');
		wrapper.className = 'md-block md-diff-hunk';

		const children: ViewNode[] = [];
		const mounts: globalThis.Node[] = [];
		const original = data.original
			? _buildDiffSide(data.original, 'md-diff-original', options, previous?._originalNode)
			: undefined;
		const modified = data.modified
			? _buildDiffSide(data.modified, 'md-diff-modified', options, previous?._modifiedNode)
			: undefined;
		if (original) { children.push(original); mounts.push(original.mountNode); }
		if (modified) { children.push(modified); mounts.push(modified.mountNode); }
		_patchDomNodes(wrapper, mounts);

		super(data, wrapper, children);
		this._originalNode = original;
		this._modifiedNode = modified;
	}

	/** The mounted sides with their highlight ranges, for the diff highlighter. */
	get sides(): readonly { readonly node: ViewNode; readonly ranges: readonly DiffHighlightRange[] }[] {
		const out: { node: ViewNode; ranges: readonly DiffHighlightRange[] }[] = [];
		if (this._originalNode && this.data.original) { out.push({ node: this._originalNode, ranges: this.data.original.ranges }); }
		if (this._modifiedNode && this.data.modified) { out.push({ node: this._modifiedNode, ranges: this.data.modified.ranges }); }
		return out;
	}
}

function _buildDiffSide(side: DiffSideViewData, cls: string, options: BlockViewOptions | undefined, prev: ViewNode | undefined): ViewNode {
	const node = createViewNode(side.view, options, prev);
	const el = (node as BlockViewNode).element;
	el.classList.add(cls);
	el.classList.toggle('md-block-active', side.active);
	el.classList.toggle('md-markers-hidden', !side.active);
	return node;
}

/**
 * Renders a {@link DiffDecorationViewData}: a read-only original block shown
 * (red) above its place in the modified document. It is `pointer-events: none`
 * and reports {@link sourceLength} `0`, so it occupies vertical space like a
 * view-zone but is invisible to the editor's source mapping, selection, and
 * measurement (it is never added to the document's `blocks`).
 */
export class DiffDecorationViewNode extends BlockViewNode<DiffDecorationViewData> {
	readonly sideNode: ViewNode;

	constructor(data: DiffDecorationViewData, options: BlockViewOptions | undefined, previous?: DiffDecorationViewNode) {
		const wrapper = (previous?.dom as HTMLElement | undefined) ?? document.createElement('div');
		wrapper.className = 'md-block md-diff-decoration';
		wrapper.style.pointerEvents = 'none';
		const sideNode = createViewNode(data.side, options, previous?.sideNode);
		const el = (sideNode as BlockViewNode).element;
		// Partial changes and whole removed videos use source form so marker-level
		// modifications stay visible and deleted media never exposes inert controls.
		const active = !data.whole || data.side.kind === 'video';
		el.classList.add(data.whole ? 'md-diff-removed' : 'md-diff-original');
		el.classList.toggle('md-block-active', active);
		el.classList.toggle('md-markers-hidden', !active);
		_patchDomNodes(wrapper, [sideNode.mountNode]);
		super(data, wrapper, [sideNode]);
		this.sideNode = sideNode;
	}

	/** A decoration has no presence in the modified document's source space. */
	override get sourceLength(): number { return 0; }

	/** True when the whole block was removed (solid band, no word-level rects). */
	get whole(): boolean { return this.data.whole; }

	/** Absolute offset of this block in the *original* document. */
	get originalStart(): number { return this.data.originalStart; }

	get deletedRanges(): readonly DiffHighlightRange[] { return this.data.deletedRanges; }
}

/** The view-data children of a container node (empty for leaves). */
function _contentOf(data: AnyViewData): readonly AnyViewData[] {
	return 'content' in data ? data.content : _NO_VIEW_CHILDREN;
}

const _NO_VIEW_CHILDREN: readonly AnyViewData[] = [];

/**
 * Text leaf. When the active block reveals source, non-obvious whitespace is
 * decorated with visible indicators (see {@link _appendDecorated}); the leaf is
 * then a `<span>` over source-mapped slices. Otherwise it is a bare Text node,
 * reused unchanged when the previous leaf rendered the same string so the node
 * the selection lives in stays attached and the cursor survives.
 */
function _textLeaf(data: TextViewData, previous: LeafViewNode | undefined): ViewNode {
	const content = data.ast.content;
	if (data.hiddenPrefixLength > 0) { return _runnerTaskTextLeaf(data, content, data.hiddenPrefixLength); }
	const ctx: WhitespaceContext = {
		leftBoundary: data.leftWordBoundary,
		rightBoundary: data.rightWordBoundary,
		decorateNewline: true,
	};
	if (data.showWhitespace && _hasDecoratableWhitespace(content, ctx)) {
		const span = document.createElement('span');
		span.className = 'md-text';
		const children = _appendDecorated(span, content, ctx, data.ast);
		return new BlockViewNode(data, span, children);
	}
	const prevDom = previous?.dom;
	const dom = prevDom instanceof globalThis.Text && prevDom.data === content
		? prevDom
		: document.createTextNode(content);
	return new LeafViewNode(data, dom);
}

/**
 * A task-item text leaf whose leading `:running:` marker (plus its mandatory
 * checkbox separator) is hidden from render. Mirrors how {@link
 * MarkerViewNode} hides source markers: the marker stays real, selectable
 * source in the DOM (a Text node under a `md-runner-marker` span that leaves
 * layout via `display: none`), per "Hidden markers remain real source" — it is
 * only ever visually hidden. Two source-mapped slices (the marker, then the
 * remaining visible text) keep offsets exact. This only renders while the
 * enclosing item is inactive (see {@link ListItemViewData.isRunning}), so its
 * text never reveals decorated whitespace either.
 */
function _runnerTaskTextLeaf(data: TextViewData, content: string, hiddenLength: number): ViewNode {
	const span = document.createElement('span');
	span.className = 'md-text';
	const markerSpan = document.createElement('span');
	markerSpan.className = 'md-runner-marker';
	markerSpan.setAttribute('aria-hidden', 'true');
	const markerText = document.createTextNode(content.slice(0, hiddenLength));
	markerSpan.appendChild(markerText);
	span.appendChild(markerSpan);
	const visibleText = document.createTextNode(content.slice(hiddenLength));
	span.appendChild(visibleText);
	return new BlockViewNode(data, span, [
		new RawLeafViewNode(data.ast, markerText, _NO_CHILDREN, hiddenLength),
		new RawLeafViewNode(data.ast, visibleText, _NO_CHILDREN, content.length - hiddenLength),
	]);
}

/** A character that is whitespace (space, tab, or a line ending). */
function _isWhitespaceChar(ch: string): boolean {
	return ch === ' ' || ch === '\t' || ch === '\n' || ch === '\r';
}

/**
 * Context that controls how the whitespace in a string is classified.
 * `leftBoundary`/`rightBoundary` say whether the inline sibling on that side
 * presents visible word content, so a single space at the leaf edge between two
 * words stays obvious. `decorateNewline` is false where a `<br>` already makes
 * the break visible (a hard line break) — the newline then gets no redundant
 * `↵`; elsewhere a source newline is collapsed (e.g. a soft break rendered as a
 * space) and the `↵` reveals the line ending hiding there.
 *
 * `newlineGlyph` switches a decorated newline from a CSS `::before` overlay (on
 * a collapsing `\n`, whose selectable box ends up beside the glyph rather than
 * under it) to a real `↵` glyph character: a non-whitespace text node that
 * keeps its own width, so the selection box coincides with the glyph and every
 * newline is individually selectable. Every newline in the run, including the
 * last, is a glyph so the caret can sit on either side of it. Used for the
 * inter-block gap glue.
 *
 * `breakGlyphClass`, when set, marks the run as a structural block break: its
 * *first* newline is the break that starts the next block and is always painted
 * as a glyph with this class (even when it is also the last/only newline, so it
 * never collapses), giving it a distinct look (blue) from the neutral
 * blank-line glyphs that follow.
 */
interface WhitespaceContext {
	readonly leftBoundary: boolean;
	readonly rightBoundary: boolean;
	readonly decorateNewline: boolean;
	readonly newlineGlyph?: boolean;
	readonly breakGlyphClass?: string;
	/**
	 * A blockquote source gap mixes newlines with `>` prefixes. The `↵` stays
	 * at the end of the line and a `<br>` puts the following `>` on the next
	 * line, instead of leaving `↵>` inline.
	 */
	readonly breakAfterNewlineGlyph?: boolean;
}

/** A hard break's `<br>` already shows the line break, so its newline gets no `↵`. */
const _HARD_BREAK_WHITESPACE: WhitespaceContext = { leftBoundary: false, rightBoundary: false, decorateNewline: false };

/** Inline source markers reveal all non-obvious whitespace while active. */
const _INLINE_MARKER_WHITESPACE: WhitespaceContext = { leftBoundary: false, rightBoundary: false, decorateNewline: true };

/**
 * An indented code block's structural indentation: every space is leading
 * (no word neighbours), so each is non-obvious and earns a `·` dot when shown.
 */
const _CODE_INDENT_WHITESPACE: WhitespaceContext = { leftBoundary: false, rightBoundary: false, decorateNewline: false };

/**
 * A single space is "obvious" — and so left undecorated — only when it sits
 * between two non-whitespace characters. The neighbours are this leaf's own
 * characters, or — at the leaf's first/last position — the adjacent inline
 * sibling when it presents visible word content (`leftBoundary`/`rightBoundary`).
 * Leading, trailing and run (2+) spaces are non-obvious and get a visible dot.
 */
function _isObviousSpace(content: string, i: number, ctx: WhitespaceContext): boolean {
	const prevObvious = i > 0 ? !_isWhitespaceChar(content[i - 1]) : ctx.leftBoundary;
	const nextObvious = i < content.length - 1 ? !_isWhitespaceChar(content[i + 1]) : ctx.rightBoundary;
	return prevObvious && nextObvious;
}

/**
 * The indicator class for the character at `i`, or `undefined` when it needs no
 * indicator (plain text, an obvious space, or a newline whose break is already
 * visible). Single source of truth for both detection and segmentation below.
 */
function _whitespaceClass(content: string, i: number, ctx: WhitespaceContext): string | undefined {
	const ch = content[i];
	if (ch === '\t') { return 'md-ws-tab'; }
	if (ch === '\n' || ch === '\r') { return ctx.decorateNewline ? 'md-ws-newline' : undefined; }
	if (ch === ' ' && !_isObviousSpace(content, i, ctx)) { return 'md-ws-space'; }
	return undefined;
}

/** Whether `content` contains any whitespace that would be decorated when revealed. */
function _hasDecoratableWhitespace(content: string, ctx: WhitespaceContext): boolean {
	for (let i = 0; i < content.length; i++) {
		const ch = content[i];
		// `newlineGlyph` turns a newline into a `↵` glyph even when the inline
		// `decorateNewline` overlay is off (a trailing block gap), so it counts.
		if (ctx.newlineGlyph && (ch === '\n' || ch === '\r')) { return true; }
		if (_whitespaceClass(content, i, ctx) !== undefined) { return true; }
	}
	return false;
}

interface WhitespaceSegment {
	readonly text: string;
	readonly cls: string | undefined;
	/** DOM text to render; defaults to `text`. The source-mapped length still comes from `text`. */
	readonly display?: string;
}

/** Split `content` into plain runs and individually-decorated whitespace characters. */
function _segmentWhitespace(content: string, ctx: WhitespaceContext): WhitespaceSegment[] {
	const segments: WhitespaceSegment[] = [];
	let plainStart = -1;
	const flushPlain = (end: number) => {
		if (plainStart >= 0) { segments.push({ text: content.slice(plainStart, end), cls: undefined }); plainStart = -1; }
	};
	// Every newline is a real `↵` glyph, including the last, so selection and the
	// caret can land on it. The first newline of a block break uses the break class.
	const breakNewline = ctx.breakGlyphClass ? content.indexOf('\n') : -1;
	for (let i = 0; i < content.length; i++) {
		const ch = content[i];
		if (ctx.newlineGlyph && (ch === '\n' || ch === '\r')) {
			flushPlain(i);
			const isBreak = i === breakNewline;
			segments.push({ text: ch, cls: isBreak ? ctx.breakGlyphClass! : 'md-ws-newline-glyph', display: '↵' });
			continue;
		}
		const cls = ctx.newlineGlyph && (ch === '\n' || ch === '\r') ? undefined : _whitespaceClass(content, i, ctx);
		if (cls === undefined) { if (plainStart < 0) { plainStart = i; } continue; }
		flushPlain(i);
		segments.push({ text: ch, cls });
	}
	flushPlain(content.length);
	return segments;
}

/**
 * Append `content` to `host`, wrapping each non-obvious whitespace character in
 * a `<span>` whose CSS overlays a visible indicator while the real character
 * stays in the DOM. Returns one source-mapped {@link RawLeafViewNode} per
 * segment, so the slices' lengths sum to `content.length` and source ↔ DOM
 * mapping is unaffected. Every segment shares the enclosing `ast` node (the text
 * or glue leaf whose content this is) for identity and carries the length of
 * its own slice — the renderer never fabricates an AST node.
 */
/**
 * A blockquote gap like `\n>\n> ` ends with the next block's `>` prefix.
 * That prefix belongs on the following line, not on its own row.
 */
function _trailingQuotePrefixStart(content: string): number {
	// A blank `>` line, then the next block's prefix: `\n>\n> `.
	if (!/\n[ \t]*>[ \t]*\n[ \t]*>[ \t]*$/.test(content)) { return -1; }
	const match = /\n([ \t]*>[ \t]*)$/.exec(content);
	return match ? content.length - match[1].length : -1;
}

function _appendDecorated(host: HTMLElement, content: string, ctx: WhitespaceContext, ast: AstNode): ViewNode[] {
	const children: ViewNode[] = [];
	const prefixAt = ctx.breakAfterNewlineGlyph ? _trailingQuotePrefixStart(content) : -1;
	let prefixHost: HTMLElement | undefined;
	let offset = 0;
	for (const seg of _segmentWhitespace(content, ctx)) {
		const inPrefix = prefixAt >= 0 && offset >= prefixAt;
		const newlineEndsPrefix = prefixAt >= 0 && offset + seg.text.length === prefixAt
			&& (seg.text === '\n' || seg.text === '\r');
		offset += seg.text.length;
		const text = document.createTextNode(seg.display ?? seg.text);
		const parent = inPrefix
			? prefixHost ?? (prefixHost = host.appendChild(Object.assign(document.createElement('span'), { className: 'ib-md-quote-line-prefix' })))
			: host;
		if (seg.cls) {
			const span = document.createElement('span');
			span.className = seg.cls;
			span.appendChild(text);
			if (ctx.breakAfterNewlineGlyph && (seg.text === '\n' || seg.text === '\r') && !newlineEndsPrefix) {
				span.appendChild(document.createElement('br'));
			}
			parent.appendChild(span);
		} else {
			parent.appendChild(text);
		}
		// The DOM may show a glyph (`seg.display`) while the source slice is
		// `seg.text`; both are length-1, so source ↔ DOM mapping is exact.
		children.push(new RawLeafViewNode(ast, text, _NO_CHILDREN, seg.text.length));
	}
	return children;
}

/** Generic leaf: a single DOM node with no children (text, KaTeX output, `<hr>`, …). */
class LeafViewNode extends BlockViewNode {
	constructor(data: AnyViewData, dom: globalThis.Node) {
		super(data, dom, _NO_CHILDREN);
	}
}

/**
 * A leaf over a raw AST node with no view-data of its own — used for synthetic
 * fragments the renderer creates internally (code-block content and its token
 * spans, decorated-whitespace characters), which participate in source mapping
 * but are never reconciled or reused on their own. It shares the enclosing real
 * ast node for identity (the renderer never fabricates AST), so {@link
 * sourceLength} is given explicitly when the fragment is only a slice of that
 * ast's content; it defaults to the full `ast.length` for a whole-content leaf.
 */
class RawLeafViewNode extends ViewNode {
	private readonly _sourceLength: number;
	constructor(ast: AstNode, dom: globalThis.Node, children: readonly ViewNode[] = _NO_CHILDREN, sourceLength: number = ast.length) {
		super(ast, dom, children);
		this._sourceLength = sourceLength;
	}
	override get sourceLength(): number { return this._sourceLength; }
}

/**
 * A zero-source-length browser layout anchor for a trailing empty line. The
 * zero-width character gives the browser something to position on that line,
 * while the view node keeps it out of source mapping and clipboard text.
 */
class VisualLineAnchorViewNode extends RawLeafViewNode {
	private readonly _span: HTMLElement;

	constructor(ast: AstNode, className?: string) {
		const span = document.createElement('span');
		if (className) { span.className = className; }
		span.setAttribute('aria-hidden', 'true');
		span.style.userSelect = 'none';
		const text = document.createTextNode('\u200b');
		span.appendChild(text);
		super(ast, text, _NO_CHILDREN, 0);
		this._span = span;
	}

	override get mountNode(): globalThis.Node { return this._span; }
}

/**
 * A marker (fence, list bullet, emphasis `*`, table pipe, …). Present in the
 * DOM as `<span class="md-marker …">` wrapping a Text node; the span gains
 * `md-marker-hidden` (→ `display: none`) when markers are hidden, so it leaves
 * layout entirely. The view node's {@link dom} is the inner Text node so source
 * offsets map onto it, while {@link mountNode} is the span the parent mounts.
 */
class MarkerViewNode extends BlockViewNode<MarkerViewData> {
	private readonly _span: HTMLElement;

	constructor(data: MarkerViewData, previous: MarkerViewNode | undefined) {
		const marker = data.ast;
		const base = `md-marker md-marker-${marker.markerKind}`;
		if (data.visible
			&& (marker.markerKind === 'reference' || marker.markerKind === 'blockQuoteContinuationMarker')
			&& _hasDecoratableWhitespace(marker.content, _INLINE_MARKER_WHITESPACE)
		) {
			const span = document.createElement('span');
			span.className = base;
			const children = _appendDecorated(span, marker.content, _INLINE_MARKER_WHITESPACE, marker);
			super(data, span, children);
			this._span = span;
			return;
		}
		// Reuse the previous span + Text node when the rendered string is
		// unchanged so the node the selection lives in stays attached and the
		// cursor survives; only the class (which depends on `visible`) is updated.
		const reuse = previous && previous.dom instanceof globalThis.Text && previous.dom.data === marker.content;
		const span = reuse ? previous._span : document.createElement('span');
		span.className = data.visible ? base : `${base} md-marker-hidden`;
		const text = reuse ? previous.dom as globalThis.Text : document.createTextNode(marker.content);
		if (!reuse) { span.appendChild(text); }
		super(data, text, _NO_CHILDREN);
		this._span = span;
	}

	override get mountNode(): globalThis.Node { return this._span; }
}

/**
 * Non-semantic syntactic glue: table cell pipes (`| `), the task-list `[x] `
 * source, and other source padding. Rendered like a {@link MarkerViewNode} —
 * a `<span>` wrapping a Text node — but when hidden it keeps its inline width
 * (`visibility: hidden`, via `md-glue-hidden`) instead of leaving layout, so
 * column widths and the checkbox gutter stay stable as markers toggle. When
 * visible, its non-obvious whitespace is decorated with visible indicators
 * (see {@link _appendDecorated}).
 */
class GlueViewNode extends BlockViewNode<GlueViewData> {
	private readonly _span: HTMLElement;

	constructor(data: GlueViewData, previous: GlueViewNode | undefined) {
		const built = GlueViewNode._build(data, previous);
		super(data, built.dom, built.children);
		this._span = built.span;
	}

	override get mountNode(): globalThis.Node { return this._span; }

	private static _build(
		data: GlueViewData,
		previous: GlueViewNode | undefined,
	): { span: HTMLElement; dom: globalThis.Node; children: readonly ViewNode[] } {
		const glue = data.ast;
		const base = glue.glueKind ? `md-glue md-glue-${glue.glueKind}` : 'md-glue';
		// Glue has no inline word neighbours; whether its newline gets a `↵`
		// depends on whether this glue sits in inline flow (decided at build time).
		// A `blockBreak` additionally paints its first newline as the blue
		// structural-break glyph (see `breakGlyphClass`).
		const isBreak = glue.glueKind === 'blockBreak';
		const isQuoteGap = glue.glueKind === 'blockQuoteSourceGap';
		// `\n> ` alone is the next line's marker. Leave it as source text so it
		// can hang in the gutter. A gap with a blank `>` line still uses glyphs.
		const quoteContinuation = isQuoteGap && /^\r?\n[ \t]*(?:>[ \t]*)+$/.test(glue.content);
		const isBlockGap = glue.glueKind === 'blockGap' || isQuoteGap;
		// A trailing block gap shows its blank-line newlines as `↵` glyphs purely by
		// virtue of its kind: `_attachBlockGaps` tags glue `blockGap`/`blockBreak`
		// only when it absorbs a gap as some block's trailing trivia, so the kind
		// itself proves "this is an editable trailing gap" — no per-block opt-in (an
		// ambient `inlineFlow`/`decorateNewline`) is needed, and every block type
		// (table, code, math, heading, …) reveals it uniformly. The hostless
		// document-level gap (leading the first block) is built always-hidden (see
		// `buildDocumentViewData`), so it never decorates and `---\n\n…` / `---\n…`
		// still render identically. `decorateNewline` now governs only the inline
		// soft-break overlay (`md-ws-newline`) for whitespace inside paragraphs.
		const ws: WhitespaceContext = {
			leftBoundary: false,
			rightBoundary: false,
			decorateNewline: data.decorateNewline,
			newlineGlyph: (isBlockGap && !quoteContinuation) || isBreak,
			breakGlyphClass: isBreak ? 'md-ws-blockbreak-glyph' : undefined,
			breakAfterNewlineGlyph: isQuoteGap && !quoteContinuation,
		};
		// Trailing `blockGap` and inter-block `blockBreak` glue always get real
		// newline glyphs (even when hidden). A one-line quote continuation stays
		// raw source. Other hidden glue stays raw until revealed.
		const decorate = !quoteContinuation && (data.visible || isBlockGap || isBreak) && _hasDecoratableWhitespace(glue.content, ws);
		if (decorate) {
			const span = document.createElement('span');
			span.className = data.visible ? base : `${base} md-glue-hidden`;
			const children = _appendDecorated(span, glue.content, ws, glue);
			return { span, dom: span, children };
		}
		// Reuse the previous span + Text node when the rendered string is unchanged
		// so the node the selection lives in stays attached and the cursor survives;
		// only the class (which depends on `visible`) is updated.
		const reuse = previous && previous.dom instanceof globalThis.Text
			&& previous.dom.data === glue.content && previous.children.length === 0;
		const span = reuse ? previous._span : document.createElement('span');
		span.className = data.visible ? base : `${base} md-glue-hidden`;
		const text = reuse ? previous.dom as globalThis.Text : document.createTextNode(glue.content);
		if (!reuse) { span.appendChild(text); }
		return { span, dom: text, children: _NO_CHILDREN };
	}
}

/**
 * The soft line ending before an explicitly repeated block-quote prefix.
 * GitHub renders this as a line break even though the surrounding content
 * remains one paragraph. The source ending stays mapped inside the holder and
 * is revealed while editing; the source-only continuation prefix that follows
 * remains an independently hideable marker.
 */
class BlockQuoteLineBreakViewNode extends BlockViewNode<GlueViewData> {
	private readonly _span: HTMLElement;
	private readonly _holder: HTMLElement;
	private readonly _break: HTMLBRElement;

	constructor(data: GlueViewData, previous: BlockQuoteLineBreakViewNode | undefined) {
		const span = previous?._span ?? document.createElement('span');
		span.className = 'md-glue md-glue-blockQuoteLineBreak md-blockquote-linebreak';
		const canReuseSource = previous?.data.ast === data.ast && previous.data.visible === data.visible;
		const holder = canReuseSource ? previous._holder : document.createElement('span');
		const children = canReuseSource
			? previous.children
			: data.visible
				? _appendDecorated(holder, data.ast.content, _INLINE_MARKER_WHITESPACE, data.ast)
				: _appendPlainText(holder, data.ast.content, data.ast);
		holder.className = data.visible
			? 'md-blockquote-linebreak-source'
			: 'md-blockquote-linebreak-source md-blockquote-linebreak-source-hidden';
		const lineBreak = previous?._break ?? document.createElement('br');
		_patchDomNodes(span, [holder, lineBreak]);
		super(data, span, children);
		this._span = span;
		this._holder = holder;
		this._break = lineBreak;
	}

	override get mountNode(): globalThis.Node { return this._span; }
}

/**
 * A GFM hard line break (`··\n` or `\␤`). Always renders a `<br>` so the line
 * breaks in both the rendered and the source view; the break's source
 * characters (the trailing spaces / backslash and the newline) are revealed —
 * with the same whitespace indicators as everything else — only while the block
 * is active, and otherwise hidden. The source text stays in the DOM either way
 * so source ↔ DOM mapping is unaffected; the `<br>` carries no source length and
 * so is not a child view node.
 */
class HardBreakViewNode extends BlockViewNode<MarkerViewData> {
	private readonly _span: HTMLElement;

	constructor(data: MarkerViewData, _previous: HardBreakViewNode | undefined) {
		const content = data.ast.content;
		const span = document.createElement('span');
		span.className = 'md-hardbreak';
		const holder = document.createElement('span');
		holder.className = data.visible ? 'md-hardbreak-src' : 'md-hardbreak-src md-hardbreak-src-hidden';
		// The `<br>` already shows the break, so the newline gets no redundant `↵`.
		const children = data.visible
			? _appendDecorated(holder, content, _HARD_BREAK_WHITESPACE, data.ast)
			: _appendPlainText(holder, content, data.ast);
		span.appendChild(holder);
		span.appendChild(document.createElement('br'));
		super(data, span, children);
		this._span = span;
	}

	override get mountNode(): globalThis.Node { return this._span; }
}

/** Append `content` as a single Text node and return its source-mapped leaf. */
function _appendPlainText(host: HTMLElement, content: string, ast: AstNode): ViewNode[] {
	const text = document.createTextNode(content);
	host.appendChild(text);
	return [new RawLeafViewNode(ast, text)];
}

/** A plain element container (`<p>`, `<blockquote>`, `<strong>`, `<td>`, …) whose children mirror the node's children. Reuses `previous`'s element when given one (same kind ⇒ same tag), so only its children are reconciled. */
class ContainerViewNode<T extends AnyViewData = AnyViewData> extends BlockViewNode<T> {
	constructor(data: T, tag: string, className: string, options: BlockViewOptions | undefined, previous: ContainerViewNode | undefined) {
		const el = previous?.element ?? document.createElement(tag);
		// A reused element already carries this kind's class (same kind ⇒ same
		// tag ⇒ same className), so only a freshly created one needs it set.
		if (!previous && className) { el.className = className; }
		const children = reconcileDomChildren(el, _contentOf(data), previous?.children, _buildChild(options));
		super(data, el, children);
	}
}

class BlockQuoteViewNode extends BlockViewNode<Extract<AnyViewData, { kind: 'blockQuote' }>> {
	private readonly _sourceChildren: readonly ViewNode[];
	private readonly _anchors: readonly VisualLineAnchorViewNode[];

	constructor(
		data: Extract<AnyViewData, { kind: 'blockQuote' }>,
		options: BlockViewOptions | undefined,
		previous: BlockQuoteViewNode | undefined,
	) {
		const el = previous?.element ?? document.createElement('blockquote');
		if (!previous) { el.className = 'md-block md-blockquote'; }
		const sourceChildren = reconcileDomChildren(el, data.content, previous?._sourceChildren, _buildChild(options));
		const trailingMarkers = _trailingBlockQuoteMarkers(data.ast);
		const anchoredMarkers = data.showFinalMarkerOnlyLine
			? trailingMarkers
			: trailingMarkers.slice(0, -1);
		el.classList.toggle('md-blockquote-marker-only-line', anchoredMarkers.length > 0);

		const previousAnchors = new Map(previous?._anchors.map(anchor => [anchor.ast.id, anchor]));
		const anchors = anchoredMarkers.map(({ marker }) => {
			const anchor = previousAnchors.get(marker.id) ?? new VisualLineAnchorViewNode(marker, 'md-blockquote-line-anchor');
			previousAnchors.delete(marker.id);
			return anchor;
		});
		for (const anchor of previousAnchors.values()) { anchor.dispose(); }

		const anchorAfterChild = new Map(anchoredMarkers.map(({ index }, i) => [index, anchors[i]]));
		const children: ViewNode[] = [];
		for (let i = 0; i < sourceChildren.length; i++) {
			children.push(sourceChildren[i]);
			const anchor = anchorAfterChild.get(i);
			if (anchor) { children.push(anchor); }
		}
		_patchDomNodes(el, children.map(child => child.mountNode));
		super(data, el, children);
		this._sourceChildren = sourceChildren;
		this._anchors = anchors;
	}
}

function _trailingBlockQuoteMarkers(blockQuote: BlockQuoteAstNode): Array<{ readonly index: number; readonly marker: MarkerAstNode }> {
	const markers: Array<{ readonly index: number; readonly marker: MarkerAstNode }> = [];
	for (let i = blockQuote.children.length - 1; i >= 0; i--) {
		const child = blockQuote.children[i];
		if (child instanceof GlueAstNode) { continue; }
		if (child instanceof MarkerAstNode && child.markerKind === 'blockQuoteMarker') {
			markers.push({ index: i, marker: child });
			continue;
		}
		break;
	}
	return markers.reverse();
}

class HeadingViewNode extends BlockViewNode<HeadingViewData> {
	constructor(data: HeadingViewData, options: BlockViewOptions | undefined, previous: HeadingViewNode | undefined) {
		const reuse = previous && previous.element.tagName === `H${data.ast.level}`;
		const el = reuse ? previous.element : document.createElement(`h${data.ast.level}`);
		if (!reuse) { el.className = 'md-block md-heading'; }
		const children = reconcileDomChildren(el, data.content, previous?.children, _buildChild(options));
		super(data, el, children);
	}
}

/**
 * A thematic break (`---`). When inactive it renders a non-text `<hr>` leaf
 * whose `sourceLength` is the node's full `ast.length` (the `---` plus any
 * trailing blank-line glue the parser absorbed), so mapping steps over it as a
 * single source-less run (no per-offset geometry). When active it reveals the
 * source as an editable
 * container: a `<div>` whose children mirror the marker (and any trailing glue),
 * so the cursor can land on and edit the `---` like any other source.
 *
 * The inactive `<hr>` is wrapped in a `<div>` that becomes this node's
 * registered {@link dom} (and the node the parent mounts). A bare `<hr>` is a
 * void element the platform hit-test (`caretPositionFromPoint`) cannot place a
 * caret inside — a click on it resolves to the surrounding flow instead. The
 * wrapping block `<div>` gives the hit-test a caret-positionable box that maps
 * back to this break. {@link element} stays the `<hr>` so the block's
 * active/markers classes and rule styling are unaffected.
 */
class ThematicBreakViewNode extends BlockViewNode<ThematicBreakViewData> {
	private readonly _contentEl: HTMLElement;

	constructor(data: ThematicBreakViewData, options: BlockViewOptions | undefined, previous: ThematicBreakViewNode | undefined) {
		if (data.showMarkup) {
			// Reuse only a previous *active* node's div: an inactive node's `dom`
			// is the wrapper div, but its children/structure are different.
			const reuse = previous?.data.showMarkup ? previous : undefined;
			const el = (reuse?.dom as HTMLElement | undefined) ?? document.createElement('div');
			if (!reuse) { el.className = 'md-block md-thematic-break-source'; }
			const children = reconcileDomChildren(el, data.content, reuse?.children, _buildChild(options));
			super(data, el, children);
			this._contentEl = el;
			return;
		}
		const wrapper = document.createElement('div');
		wrapper.className = 'md-block md-thematic-break-wrapper';
		const hr = document.createElement('hr');
		hr.className = 'md-block md-thematic-break';
		wrapper.appendChild(hr);
		super(data, wrapper, _NO_CHILDREN);
		this._contentEl = hr;
	}

	override get element(): HTMLElement { return this._contentEl; }
}

class VideoViewNode extends BlockViewNode<VideoViewData> {
	private readonly _video: HTMLVideoElement | undefined;
	private _editContextSuspension: IDisposable | undefined;
	private readonly _editContextSuspensionFactory: BlockViewOptions['suspendEditContextWhileFocused'];

	constructor(data: VideoViewData, options: BlockViewOptions | undefined, previous: VideoViewNode | undefined) {
		const suspensionFactory = options?.suspendEditContextWhileFocused;
		if (data.showMarkup) {
			previous?._disposeEditContextSuspension();
			const reusableSource = previous?.data.showMarkup === true && previous.dom instanceof HTMLDivElement
				? previous
				: undefined;
			const source = reusableSource?.element ?? document.createElement('div');
			if (reusableSource === undefined) { source.className = 'md-block md-video-source'; }
			_applyVideoDiffClasses(source, data);
			const children = reconcileDomChildren(source, data.content, reusableSource?.children, _buildChild(options));
			super(data, source, children);
			this._video = undefined;
			this._editContextSuspensionFactory = suspensionFactory;
			return;
		}

		const reusableVideo = previous?.data.showMarkup === false
			? previous._video
			: undefined;
		const reusableWrapper = previous?.data.showMarkup === false && previous.dom instanceof HTMLDivElement
			? previous.dom
			: undefined;
		const wrapper = reusableWrapper ?? document.createElement('div');
		if (!reusableWrapper) {
			wrapper.className = 'md-block md-video-wrapper';
		}
		_applyVideoDiffClasses(wrapper, data);
		const video = reusableVideo ?? document.createElement('video');
		if (reusableVideo === undefined) {
			video.className = 'md-video';
			video.addEventListener('pointerdown', event => {
				if (video.controls) {
					event.stopPropagation();
				}
			});
			wrapper.appendChild(video);
		}

		let editContextSuspension: IDisposable | undefined;
		if (
			reusableVideo
			&& previous?._editContextSuspension
			&& previous._editContextSuspensionFactory === suspensionFactory
		) {
			editContextSuspension = previous._editContextSuspension;
			previous._editContextSuspension = undefined;
		}
		previous?._disposeEditContextSuspension();

		const attributes = data.ast.attributes;
		const safeSrc = _isSafeUrl(attributes.src) ? attributes.src : undefined;
		if (safeSrc === undefined) {
			if (video.hasAttribute('src')) {
				video.removeAttribute('src');
				video.load();
			}
		} else if (video.getAttribute('src') !== safeSrc) {
			video.setAttribute('src', safeSrc);
			video.load();
		}
		if (attributes.title === undefined) {
			video.removeAttribute('title');
			video.removeAttribute('aria-label');
		} else {
			video.title = attributes.title;
			video.setAttribute('aria-label', attributes.title);
		}
		video.autoplay = attributes.autoplay;
		video.controls = attributes.controls;
		video.loop = attributes.loop;
		const mutedChanged = video.defaultMuted !== attributes.muted;
		video.defaultMuted = attributes.muted;
		if (reusableVideo === undefined || mutedChanged) {
			video.muted = attributes.muted;
		}

		super(data, wrapper, _NO_CHILDREN);
		this._video = video;
		this._editContextSuspensionFactory = suspensionFactory;
		this._editContextSuspension = editContextSuspension ?? suspensionFactory?.(video);
	}

	private _disposeEditContextSuspension(): void {
		this._editContextSuspension?.dispose();
		this._editContextSuspension = undefined;
	}

	override dispose(): void {
		this._disposeEditContextSuspension();
		super.dispose();
	}
}

function _applyVideoDiffClasses(element: HTMLElement, data: VideoViewData): void {
	element.classList.toggle('md-diff-added', data.diffKind === 'added');
	element.classList.toggle('md-diff-modified', data.diffKind === 'modified');
}

/**
 * An {@link UnhandledBlockViewData unhandled block}: a construct the parser does
 * not model (a setext heading or an extension token). It has
 * no active/inactive split — the verbatim source is always shown — so it renders
 * like a code block (`<pre><code>` with the raw text as a single leaf) but
 * carries an `md-unhandled-block` class so the theme can style it distinctly.
 * The raw `content` marker tiles the block's full span, keeping source ↔ DOM
 * mapping exact; the text stays selectable and editable.
 *
 * The scrolling `<pre>` is wrapped in a non-scrolling `<div>` that owns the
 * border. {@link element} is the inner `<pre>` — the real scroll viewport — so
 * the selection/caret clipping measures the right box.
 */
class UnhandledBlockViewNode extends BlockViewNode<UnhandledBlockViewData> {
	private readonly _scroller: HTMLElement;

	constructor(data: UnhandledBlockViewData, options: BlockViewOptions | undefined, previous: UnhandledBlockViewNode | undefined) {
		const reuse = previous && previous.dom instanceof HTMLDivElement ? previous : undefined;
		const wrapper = (reuse?.dom as HTMLDivElement | undefined) ?? document.createElement('div');
		if (!reuse) { wrapper.className = 'md-block md-unhandled-block'; }
		const pre = reuse?._scroller ?? document.createElement('pre');
		if (!reuse) {
			pre.className = 'md-code-block md-unhandled-scroll';
			wrapper.appendChild(pre);
		}
		const code = (reuse ? pre.querySelector('code') : null) ?? document.createElement('code');
		if (!reuse) { pre.appendChild(code); }
		const kids = reconcileDomChildren(code, data.content, reuse?.children, (childData, prev) => {
			const childAst = childData.ast;
			if (childData.kind === 'marker' && (childAst as MarkerAstNode).markerKind === 'content') {
				const prevText = prev instanceof RawLeafViewNode && prev.dom.nodeType === globalThis.Node.TEXT_NODE
					&& (prev.dom as Text).data === (childAst as MarkerAstNode).content ? prev.dom : undefined;
				const text = prevText ?? document.createTextNode((childAst as MarkerAstNode).content);
				return new RawLeafViewNode(childAst, text);
			}
			return createViewNode(childData, options, prev);
		});
		super(data, wrapper, kids);
		this._scroller = pre;
	}

	override get element(): HTMLElement { return this._scroller; }
}

/**
 * A block HTML comment. Open and complete comments share this DOM shape so
 * typing or deleting the closer never falls back to the unhandled-code surface.
 * Inactive comments are quiet metadata; active comments reveal exact source.
 */
class HtmlCommentViewNode extends BlockViewNode<UnhandledBlockViewData> {
	constructor(
		data: UnhandledBlockViewData,
		htmlComment: HtmlCommentSource,
		options: BlockViewOptions | undefined,
		previous: HtmlCommentViewNode | undefined,
	) {
		const wrapper = previous?.dom instanceof HTMLDivElement ? previous.dom : document.createElement('div');
		wrapper.className = `md-block md-html-comment md-html-comment-${htmlComment.kind}${data.showMarkup ? ' md-html-comment-source' : ''}`;
		const children = reconcileDomChildren(wrapper, data.content, previous?.children, (childData, prev) => {
			const childAst = childData.ast;
			if (childData.kind === 'marker' && (childAst as MarkerAstNode).markerKind === 'content') {
				return new HtmlCommentContentViewNode(childAst as MarkerAstNode, htmlComment, _prev(prev, HtmlCommentContentViewNode));
			}
			return createViewNode(childData, options, prev);
		});
		super(data, wrapper, children);
	}
}

/** Splits one source-mapped comment marker into lossless syntax/body spans. */
class HtmlCommentContentViewNode extends ViewNode {
	constructor(ast: MarkerAstNode, comment: HtmlCommentSource, previous: HtmlCommentContentViewNode | undefined) {
		const host = previous?.dom instanceof HTMLSpanElement ? previous.dom : document.createElement('span');
		host.className = 'md-html-comment-content';

		const pieces: Array<{ className: string; content: string }> = [
			{ className: 'md-html-comment-syntax', content: comment.leadingWhitespace },
			{ className: 'md-html-comment-syntax', content: comment.opening },
			{ className: 'md-html-comment-body', content: comment.body },
		];
		if (comment.kind === 'complete') {
			pieces.push(
				{ className: 'md-html-comment-syntax', content: comment.closing },
				{ className: 'md-html-comment-syntax', content: comment.trailingWhitespace },
			);
		}
		const nonEmptyPieces = pieces.filter(piece => piece.content.length > 0);
		const children = nonEmptyPieces.map((piece, index) => {
			const previousChild = previous?.children[index] instanceof HtmlCommentPieceViewNode
				? previous.children[index]
				: undefined;
			const span = previousChild?.mountNode instanceof HTMLSpanElement
				? previousChild.mountNode
				: document.createElement('span');
			span.className = piece.className;
			const previousText = previousChild?.dom instanceof Text ? previousChild.dom : undefined;
			const text = previousText?.data === piece.content ? previousText : document.createTextNode(piece.content);
			_patchDomNodes(span, [text]);
			return new HtmlCommentPieceViewNode(ast, text, span, piece.content.length);
		});
		_patchDomNodes(host, children.map(child => child.mountNode));
		super(ast, host, children);
	}
}

/** A source-mapped text slice mounted through its styling span. */
class HtmlCommentPieceViewNode extends RawLeafViewNode {
	constructor(ast: MarkerAstNode, text: Text, private readonly _span: HTMLSpanElement, sourceLength: number) {
		super(ast, text, _NO_CHILDREN, sourceLength);
	}

	override get mountNode(): globalThis.Node { return this._span; }
}

/**
 * YAML front matter is an opaque fenced-text block. It shares the normal code
 * block surface and source mapping, but never invokes custom code renderers or
 * embedded code editors.
 */
class FrontMatterViewNode extends BlockViewNode<FrontMatterViewData> {
	private _session: ISyntaxHighlighterDocument | undefined;
	private _snapshotSub: IDisposable | undefined;

	constructor(data: FrontMatterViewData, options: BlockViewOptions | undefined, previous: FrontMatterViewNode | undefined) {
		const ast = data.ast;
		const contentAst = ast.value;
		const content = contentAst?.content ?? '';
		const highlighter = options?.syntaxHighlighter;

		let session: ISyntaxHighlighterDocument | undefined;
		if (contentAst && highlighter) {
			if (previous?._session && ast === previous.ast) {
				session = previous._session;
				previous._session = undefined;
			} else {
				session = highlighter.create('yaml', content);
			}
		}
		previous?._session?.dispose();
		if (previous) { previous._session = undefined; }
		previous?._snapshotSub?.dispose();
		if (previous) { previous._snapshotSub = undefined; }

		const tokens = session
			? session.snapshot.get().getTokens(OffsetRange.ofLength(content.length)).tokens
			: undefined;
		const built = _buildFencedTextBlock(
			data.content,
			contentAst,
			content,
			options,
			'md-block md-code-block md-front-matter',
			'yaml',
			tokens,
		);
		super(data, built.dom, built.children);
		this._session = session;

		if (session && built.contentNode) {
			const contentNode = built.contentNode;
			this._snapshotSub = runOnChange(session.snapshot, () => {
				const snapshot = session!.snapshot.get();
				contentNode.refresh(content, snapshot.getTokens(OffsetRange.ofLength(content.length)).tokens);
			});
		}
	}

	override dispose(): void {
		this._snapshotSub?.dispose();
		this._snapshotSub = undefined;
		this._session?.dispose();
		this._session = undefined;
		super.dispose();
	}
}

/**
 * A fenced code block. It owns its incremental
 * {@link ISyntaxHighlighterDocument} session: constructing the node creates (or
 * adopts from `previous`) the session, and disposing the node disposes it, so
 * colouring stays incremental across edits — the session is reused and
 * `update`d rather than rebuilt. A node at any depth owns a session; the only
 * difference today is that the parser links `getDiff` for top-level code blocks
 * only, so a nested block currently builds a fresh session on each rebuild.
 */
export class CodeBlockViewNode extends BlockViewNode<CodeBlockViewData> {
	private _session: ISyntaxHighlighterDocument | undefined;
	/**
	 * Subscription that re-tokenises the rendered `<code>` in place whenever the
	 * session advances its {@link ISyntaxHighlighterDocument.snapshot} *without*
	 * a source edit (an async grammar finishing, a live recolour). It is tied to
	 * this node's lifetime, but like {@link _session} it must be disposed
	 * manually: a node reused as `previous` for a rebuild is never `dispose`d
	 * (see {@link reconcileDomChildren}), so the rebuilding constructor disposes
	 * its predecessor's subscription explicitly.
	 */
	private _snapshotSub: IDisposable | undefined;

	/**
	 * An in-place interactive editor (e.g. an iframe) mounted instead of the
	 * rendered code. Like {@link _session} it is adopted from `previous` across
	 * rebuilds so the underlying editor keeps its state, and must be disposed
	 * manually (a node reused as `previous` is never {@link dispose}d).
	 */
	private _embeddedEditor: IEmbeddedCodeEditor | undefined;
	private readonly _embeddedEditorFactoryVersion: unknown;
	private readonly _embeddedEditorReadOnly: boolean;

	override canReuse(data: AnyViewData, options: BlockViewOptions | undefined): boolean {
		return super.canReuse(data, options)
			&& Object.is(options?.embeddedCodeEditorFactoryVersion, this._embeddedEditorFactoryVersion)
			&& (
				!this._embeddedEditor
				|| (options?.embeddedCodeEditorReadOnly ?? false) === this._embeddedEditorReadOnly
			);
	}

	constructor(data: CodeBlockViewData, options: BlockViewOptions | undefined, previous: ViewNode | undefined) {
		const ast = data.ast;
		const content = ast.code?.content ?? '';
		const prevCode = previous instanceof CodeBlockViewNode ? previous : undefined;
		const embeddedEditorReadOnly = options?.embeddedCodeEditorReadOnly ?? false;

		// The `content` marker includes the newline after the open fence and the
		// newline before the close fence (see parser). An embedded editor must only
		// see the inner code — otherwise its first/last line would edit those
		// separators and corrupt the fences — so strip them and remember the leading
		// length to shift the editor's edits back into code-marker coordinates.
		const embeddedContent = getEmbeddedCodeBlockContent(content);

		// Embedded editor: adopt `previous`'s editor when the block is the same
		// node or an in-content edit links them (getDiff), so the editor keeps
		// its state across edits; otherwise create a fresh one. Takes precedence
		// over the custom renderer and highlighting. Any editor on `previous` we
		// do not adopt is disposed below.
		let embedded: IEmbeddedCodeEditor | undefined;
		if (
			!data.showMarkup
			&& ast.language
			&& ast.code
			&& ast.closeFence
			&& embeddedContent.sourceOffset > 0
			&& options?.embeddedCodeEditorFactory
		) {
			if (
				prevCode?._embeddedEditor
				&& Object.is(options.embeddedCodeEditorFactoryVersion, prevCode._embeddedEditorFactoryVersion)
				&& (ast === prevCode.ast || ast.getDiff(prevCode.ast as CodeBlockAstNode))
			) {
				embedded = prevCode._embeddedEditor;
				prevCode._embeddedEditor = undefined;
			} else {
				embedded = options.embeddedCodeEditorFactory.create(ast.language, ast.infoString, embeddedContent.text) ?? undefined;
			}
		}
		if (prevCode?._embeddedEditor) { prevCode._embeddedEditor.dispose(); prevCode._embeddedEditor = undefined; }

		const custom = (!embedded && !data.showMarkup && ast.language && ast.closeFence && options?.renderCustomCodeBlock)
			? _renderCustomCodeBlock(options.renderCustomCodeBlock, ast.language, content)
			: undefined;
		const highlighter = options?.syntaxHighlighter;

		// Adopt `previous`'s session when we can (same block, or an in-content
		// edit reported by getDiff); otherwise create a fresh one. Any session
		// on `previous` we do not adopt is disposed.
		let session: ISyntaxHighlighterDocument | undefined;
		if (!embedded && !custom && highlighter && ast.language) {
			if (prevCode?._session && ast === prevCode.ast) {
				session = prevCode._session;
				prevCode._session = undefined;
			} else if (prevCode?._session) {
				const diff = ast.getDiff(prevCode.ast as CodeBlockAstNode);
				if (diff) {
					session = prevCode._session;
					prevCode._session = undefined;
					transaction(tx => session!.update(diff.stringEdit, tx));
				}
			}
			if (!session) { session = highlighter.create(ast.language, content); }
		}
		if (prevCode?._session) { prevCode._session.dispose(); prevCode._session = undefined; }
		// The predecessor's in-place subscription is bound to its (now discarded)
		// DOM; drop it before this node installs its own.
		prevCode?._snapshotSub?.dispose();
		if (prevCode) { prevCode._snapshotSub = undefined; }

		const tokens = session
			? session.snapshot.get().getTokens(OffsetRange.ofLength(content.length)).tokens
			: undefined;

		let dom: HTMLElement;
		let children: readonly ViewNode[];
		let contentNode: CodeContentViewNode | undefined;
		if (embedded) {
			// Push current content down (idempotent — the editor drops content it
			// already holds, so its own edits don't echo back) and route its
			// edits to the current AST node. Reserve a synchronous height estimate
			// so the layout doesn't jump before the editor measures itself.
			embedded.element.classList.add('md-block', 'md-code-block');
			const estimated = embedded.estimateHeight?.(embeddedContent.text);
			if (estimated !== undefined) {
				embedded.element.style.boxSizing = 'border-box';
				embedded.element.style.minHeight = `${estimated}px`;
			}
			// Shift the editor's (inner-content) edit back over the stripped leading
			// newline so it lands in code-marker coordinates, leaving the fence
			// separators untouched.
			embedded.onEdit = (edit) => {
				const shifted = embeddedContent.sourceOffset === 0 ? edit : new StringEdit(
					edit.replacements.map((r) => StringReplacement.replace(r.replaceRange.delta(embeddedContent.sourceOffset), r.newText)),
				);
				options?.onEmbeddedCodeEditorEdit?.(ast, shifted);
			};
			embedded.setReadOnly?.(options?.embeddedCodeEditorReadOnly ?? false);
			embedded.setContent(embeddedContent.text);
			dom = embedded.element;
			children = _NO_CHILDREN;
		} else if (custom) {
			custom.classList.add('md-block', 'md-code-block');
			dom = custom;
			children = _NO_CHILDREN;
		} else if (!ast.openFence) {
			// Indented code block: no fences, no language (so no highlighting).
			// The per-line `codeIndent` markers are hideable so the structural
			// indentation drops out of the rendered block when markup is hidden
			// (like a heading's `#`); the `content` markers carry the code text
			// verbatim. Everything tiles one `<code>`; any trailing block glue
			// (a following gap) sits in the `<pre>` after it, as for fences.
			const pre = document.createElement('pre');
			pre.className = 'md-block md-code-block';
			const code = document.createElement('code');
			pre.appendChild(code);
			const kids: ViewNode[] = [];
			for (const childData of data.content) {
				const childAst = childData.ast;
				if (childData.kind === 'marker' && (childAst as MarkerAstNode).markerKind === 'content') {
					const text = document.createTextNode((childAst as MarkerAstNode).content);
					code.appendChild(text);
					kids.push(new RawLeafViewNode(childAst, text));
				} else if (childData.kind === 'marker' && (childAst as MarkerAstNode).markerKind === 'codeIndent') {
					const marker = childAst as MarkerAstNode;
					// When revealed, the structural indentation is all non-obvious
					// whitespace, so paint each space as a `·` dot (like decorated
					// inline whitespace); when hidden it collapses to nothing
					// (`md-marker-hidden`), dedenting the code.
					if ((childData as MarkerViewData).visible) {
						const span = document.createElement('span');
						span.className = 'md-marker md-marker-codeIndent';
						const leaves = _appendDecorated(span, marker.content, _CODE_INDENT_WHITESPACE, marker);
						code.appendChild(span);
						kids.push(new RawLeafViewNode(marker, span, leaves));
					} else {
						const vn = createViewNode(childData, options, undefined);
						code.appendChild(vn.mountNode);
						kids.push(vn);
					}
				} else {
					const vn = createViewNode(childData, options, undefined);
					pre.appendChild(vn.mountNode);
					kids.push(vn);
				}
			}
			dom = pre;
			children = kids;
		} else {
			const built = _buildFencedTextBlock(
				data.content,
				ast.code,
				content,
				options,
				'md-block md-code-block',
				ast.language || undefined,
				tokens,
			);
			const pre = built.dom;
			const kids = built.children;
			contentNode = built.contentNode;
			if (!ast.closeFence && ast.code && content.endsWith('\n')) {
				const anchor = new VisualLineAnchorViewNode(ast.code);
				pre.appendChild(anchor.mountNode);
				kids.push(anchor);
			}
			dom = pre;
			children = kids;
		}

		super(data, dom, children);
		this._session = session;
		this._embeddedEditor = embedded;
		this._embeddedEditorFactoryVersion = options?.embeddedCodeEditorFactoryVersion;
		this._embeddedEditorReadOnly = embeddedEditorReadOnly;
		// Re-tokenise in place on every later snapshot change. `runOnChange`
		// fires only on *future* changes, so the synchronous `session.update`
		// above (a source edit) is already reflected and does not re-trigger.
		if (session && contentNode) {
			this._snapshotSub = runOnChange(session.snapshot, () => {
				const snapshot = session!.snapshot.get();
				contentNode!.refresh(content, snapshot.getTokens(OffsetRange.ofLength(content.length)).tokens);
			});
		}
	}

	override dispose(): void {
		this._snapshotSub?.dispose();
		this._snapshotSub = undefined;
		this._session?.dispose();
		this._session = undefined;
		this._embeddedEditor?.dispose();
		this._embeddedEditor = undefined;
		super.dispose();
	}
}

function _renderCustomCodeBlock(
	renderer: NonNullable<BlockViewOptions['renderCustomCodeBlock']>,
	language: string,
	content: string,
): HTMLElement | undefined {
	try {
		return renderer(language, content);
	} catch (error) {
		console.error(`Custom code block renderer failed for ${language}.`, error);
		return undefined;
	}
}

interface FencedTextBlockRendering {
	readonly dom: HTMLElement;
	readonly children: ViewNode[];
	readonly contentNode?: CodeContentViewNode;
}

function _buildFencedTextBlock(
	contentData: readonly AnyViewData[],
	contentAst: MarkerAstNode | undefined,
	content: string,
	options: BlockViewOptions | undefined,
	className: string,
	language: string | undefined,
	tokens: readonly Token[] | undefined,
): FencedTextBlockRendering {
	const pre = document.createElement('pre');
	pre.className = className;
	const children: ViewNode[] = [];
	let contentNode: CodeContentViewNode | undefined;
	for (const childData of contentData) {
		if (contentAst && childData.ast === contentAst) {
			const code = document.createElement('code');
			if (language) { code.className = `language-${CSS.escape(language)}`; }
			const built = _buildCodeContent(contentAst, content, code, tokens);
			if (built instanceof CodeContentViewNode) { contentNode = built; }
			children.push(built);
			pre.appendChild(code);
		} else {
			const viewNode = createViewNode(childData, options, undefined);
			pre.appendChild(viewNode.mountNode);
			children.push(viewNode);
		}
	}
	return { dom: pre, children, contentNode };
}

/**
 * The single view node for a code block's content (the `content` marker),
 * mirroring its character length exactly so source ↔ DOM mapping is unaffected.
 * With `tokens` the content is split into coloured token spans under `code`
 * (token leaves as children); without, it is one Text node.
 */
function _buildCodeContent(
	contentAst: MarkerAstNode,
	content: string,
	code: HTMLElement,
	tokens: readonly Token[] | undefined,
): ViewNode {
	if (!tokens) {
		const text = document.createTextNode(content);
		code.appendChild(text);
		return new RawLeafViewNode(contentAst, text);
	}
	return new CodeContentViewNode(contentAst, code, content, tokens);
}

/**
 * The `<code>` content of a syntax-highlighted code block. Its DOM (the token
 * `<span>`s) and its source-mapping token leaves are rebuilt in place by
 * {@link refresh} when the highlighter recolours, so a recolour patches only
 * this subtree's DOM — the surrounding view-node tree (and the editor's
 * measured layout) is untouched.
 */
class CodeContentViewNode extends ViewNode {
	constructor(contentAst: MarkerAstNode, code: HTMLElement, content: string, tokens: readonly Token[]) {
		super(contentAst, code, _buildTokenLeaves(contentAst, code, content, tokens));
	}

	/** Re-render the token spans for a new colouring, in place. */
	refresh(content: string, tokens: readonly Token[]): void {
		const code = this.dom as HTMLElement;
		code.replaceChildren();
		this._replaceChildren(_buildTokenLeaves(this.ast as MarkerAstNode, code, content, tokens));
	}
}

/**
 * Append the token spans for `content` to `code` and return the per-token
 * source-mapping leaves (each a Text-node leaf carrying its slice length), so
 * the leaves tile `[0, content.length)` exactly.
 */
function _buildTokenLeaves(
	contentAst: MarkerAstNode,
	code: HTMLElement,
	content: string,
	tokens: readonly Token[],
): ViewNode[] {
	const tokenLeaves: ViewNode[] = [];
	let offset = 0;
	for (const token of tokens) {
		const piece = content.slice(offset, offset + token.length);
		offset += token.length;
		const text = document.createTextNode(piece);
		if (token.className) {
			const span = document.createElement('span');
			for (const cls of token.className.split('.')) {
				if (cls) { span.classList.add(`tok-${cls}`); }
			}
			span.appendChild(text);
			code.appendChild(span);
		} else {
			code.appendChild(text);
		}
		tokenLeaves.push(new RawLeafViewNode(contentAst, text, _NO_CHILDREN, piece.length));
	}
	return tokenLeaves;
}

/**
 * Relative start offset of the math content (the `content` marker) within a
 * math node's children. Mirrors `CodeBlockAstNode.codeOffset` for math nodes,
 * which do not carry it themselves.
 */
function _mathContentOffset(content: readonly AstNode[]): number {
	let pos = 0;
	for (const c of content) {
		if (c.kind === 'marker' && (c as MarkerAstNode).markerKind === 'content') { return pos; }
		pos += c.length;
	}
	return pos;
}

/**
 * Build a fully-tiled child list for an inactive (rendered) math node from the
 * source-mapped {@link MathSourceSegment segments} a {@link BlockViewOptions.renderMath}
 * renderer reported. The segments cover only the spans the renderer could map
 * back to source (e.g. identifier glyphs); the gaps before/between/after them
 * are filled with synthetic filler leaves (a detached, empty Text node carrying
 * only a length) so the children tile the node's whole `[0, nodeLength)` source
 * range in source order. That ordered tiling is what
 * {@link ViewNode.localOffsetInParent}/{@link ViewNode.sourceToDom} rely on to
 * lift a hit on a mapped glyph to the correct absolute source offset; a hit that
 * lands on an unmapped (filler) region simply resolves to the math node's start.
 */
function _buildMathSegmentChildren(ast: AstNode, segments: readonly MathSourceSegment[], nodeLength: number): ViewNode[] {
	const sorted = segments
		.filter(s => s.length > 0 && s.start >= 0 && s.start + s.length <= nodeLength)
		.slice()
		.sort((a, b) => a.start - b.start);
	const children: ViewNode[] = [];
	let pos = 0;
	const filler = (len: number) => {
		if (len > 0) { children.push(new RawLeafViewNode(ast, document.createTextNode(''), _NO_CHILDREN, len)); }
	};
	for (const seg of sorted) {
		if (seg.start < pos) { continue; } // overlapping segment — skip to keep tiling monotone
		filler(seg.start - pos);
		children.push(new RawLeafViewNode(ast, seg.dom, _NO_CHILDREN, seg.length));
		pos = seg.start + seg.length;
	}
	filler(nodeLength - pos);
	return children;
}

class MathBlockViewNode extends BlockViewNode<MathBlockViewData> {
	/**
	 * The rendered (inactive, KaTeX) height in px, measured after mount and
	 * carried forward across rebuilds via `previous`. When the block becomes
	 * active (source markers shown) this height is reserved as a `min-height`
	 * so the editor does not collapse below the rendered size, keeping the
	 * surrounding layout stable as the caret enters and leaves the block.
	 */
	private _renderedHeight: number | undefined;

	constructor(data: MathBlockViewData, options: BlockViewOptions | undefined, previous: MathBlockViewNode | undefined) {
		const ast = data.ast;
		const remembered = previous?._renderedHeight;
		if (data.showMarkup) {
			const pre = document.createElement('pre');
			pre.className = 'md-block md-math-block';
			// Reserve the rendered height measured while inactive so toggling to
			// the source view does not shrink the block (and the layout below it
			// stays put). Only ever grows the box, never clips the source.
			// `border-box` so the reserved (getBoundingClientRect) height — which
			// includes padding — is matched exactly rather than padding-on-padding.
			if (remembered !== undefined) {
				pre.style.boxSizing = 'border-box';
				pre.style.minHeight = `${remembered}px`;
			}
			const children: ViewNode[] = [];
			for (const childData of data.content) {
				if (childData.ast === ast.code) {
					const code = document.createElement('code');
					const text = document.createTextNode(ast.code.content);
					code.appendChild(text);
					pre.appendChild(code);
					children.push(new RawLeafViewNode(ast.code, text));
				} else {
					const vn = createViewNode(childData, options, undefined);
					pre.appendChild(vn.mountNode);
					children.push(vn);
				}
			}
			super(data, pre, children);
			this._renderedHeight = remembered;
			return;
		}
		const latex = ast.code?.content ?? '';
		const rendering = options?.renderMath?.({
			latex,
			displayMode: true,
			className: 'md-block md-math-block',
			nodeLength: ast.length,
			contentStart: _mathContentOffset(ast.content),
		});
		if (rendering) {
			super(data, rendering.dom, _buildMathSegmentChildren(ast, rendering.segments, ast.length));
			this._renderedHeight = remembered;
			return;
		}
		const div = document.createElement('div');
		div.className = 'md-block md-math-block';
		try {
			katex.render(latex, div, { displayMode: true, throwOnError: false });
		} catch {
			div.textContent = latex;
		}
		super(data, div, _NO_CHILDREN);
		this._renderedHeight = remembered;
	}

	override recordMeasuredHeight(height: number): void {
		// Only the inactive (rendered) form defines the height to reserve; the
		// active form's height is whatever the source needs (>= the reserved min).
		if (!this.data.showMarkup) { this._renderedHeight = height; }
	}
}

/**
 * A list. Each item carries its own `isActive` flag (the builder computes which
 * items the selection reaches), so the list just dispatches each child to its
 * view node — the per-item active state lives on the {@link ListItemViewData}.
 */
class ListViewNode extends BlockViewNode<ListViewData> {
	constructor(data: ListViewData, options: BlockViewOptions | undefined, previous: ListViewNode | undefined) {
		const tag = data.ast.ordered ? 'ol' : 'ul';
		const reuse = previous && previous.element.tagName === tag.toUpperCase();
		const el = reuse ? previous.element : document.createElement(tag);
		if (!reuse) { el.className = 'md-block md-list'; }
		const children = reconcileDomChildren(el, data.content, previous?.children, _buildChild(options));
		super(data, el, children);
	}
}

class ListItemViewNode extends BlockViewNode<ListItemViewData> {
	constructor(data: ListItemViewData, options: BlockViewOptions | undefined, previous: ListItemViewNode | undefined) {
		const ast = data.ast;
		const li = previous?.element ?? document.createElement('li');
		li.classList.toggle('md-list-item-active', data.isActive);
		li.classList.toggle('md-task-list-item', ast.checked !== undefined);
		li.classList.toggle('md-markers-hidden', !data.isActive);
		li.classList.toggle('md-task-list-item-running', data.isRunning);
		li.style.setProperty('--md-list-level', String(data.level));

		const children = _reconcileListItem(li, data.content, previous, options);

		// Checkbox affordance for collapsed task items. Not part of the AST
		// mirror, so it is prepended after the children are reconciled.
		if (!data.isActive && ast.checked !== undefined) {
			const checkbox = document.createElement('input');
			checkbox.type = 'checkbox';
			checkbox.checked = ast.checked;
			checkbox.className = 'md-checkbox';
			if (data.isRunning) {
				checkbox.classList.add('md-checkbox-running');
				checkbox.indeterminate = true;
				checkbox.setAttribute('aria-busy', 'true');
				checkbox.setAttribute('aria-label', 'In progress');
			}
			const onToggle = options?.onToggleCheckbox;
			if (onToggle) {
				const wasChecked = ast.checked;
				checkbox.addEventListener('pointerdown', e => {
					e.stopPropagation();
				});
				checkbox.addEventListener('click', e => {
					e.stopPropagation();
					e.preventDefault();
					onToggle(ast, !wasChecked);
				});
			} else {
				checkbox.disabled = true;
			}
			li.insertBefore(checkbox, li.firstChild);
		}

		super(data, li, children);
	}
}

/**
 * Reconcile a list item's children into `li`. A nested item carries its source
 * indentation as a leading `indent` glue before the bullet marker; that pair is
 * mounted together inside an absolutely-positioned `.md-list-gutter` span so the
 * indentation dots sit in the gutter *before* the bullet (matching the source
 * `␣␣- text`) while the item text stays at the content edge in both states.
 * Items without a leading indent (top-level bullets) mount their children
 * directly, keeping the bullet in the gutter via `.md-marker-listItemMarker`.
 *
 * The returned children array always mirrors `content` 1:1 and in source order,
 * so the source ↔ DOM mapping is unaffected by the gutter wrapper.
 */
function _reconcileListItem(
	li: HTMLElement,
	content: readonly AnyViewData[],
	previous: ListItemViewNode | undefined,
	options: BlockViewOptions | undefined,
): ViewNode[] {
	const { paired, unused } = pairNodes(content, previous?.children ?? _NO_CHILDREN);
	const children = content.map(d => createViewNode(d, options, paired.get(d)));
	for (const u of unused) { u.dispose(); }

	const hasIndentGutter = content.length >= 2
		&& content[0].kind === 'glue' && content[0].ast.glueKind === 'indent'
		&& content[1].kind === 'marker' && content[1].ast.markerKind === 'listItemMarker';

	if (!hasIndentGutter) {
		_patchDomNodes(li, children.map(c => c.mountNode));
		return children;
	}

	const first = li.firstElementChild;
	const gutter = first && first.classList.contains('md-list-gutter')
		? first as HTMLElement
		: document.createElement('span');
	gutter.className = 'md-list-gutter';
	_patchDomNodes(gutter, [children[0].mountNode, children[1].mountNode]);
	_patchDomNodes(li, [gutter, ...children.slice(2).map(c => c.mountNode)]);
	return children;
}


/**
 * A table row (`<tr>`). The delimiter row (`| --- | --- |`) gets
 * `md-table-delimiter-row` so the CSS can collapse/reveal it. After its cells
 * are reconciled, each cell the selection reaches ({@link TableCellViewData.isActive}
 * on a non-delimiter row) gets `md-table-cell-active`. The class is toggled on
 * every reconciliation because the underlying `<td>` is intentionally reused.
 */
/**
 * A GFM table. The `<table>` is wrapped in a `<div>` that becomes this node's
 * registered {@link dom} (and the node the parent mounts), so a click on the
 * table's borders or padding — areas the platform hit-test
 * (`caretPositionFromPoint`) does not place a caret inside a `<table>` — lands
 * on a caret-positionable box that maps back to this table rather than the
 * surrounding flow. The cells themselves are their own view nodes, so clicks on
 * cell text still resolve precisely. {@link element} stays the `<table>` so the
 * block's active/markers classes and the `.md-table` theme styling are
 * unaffected, and the row children are reconciled into it. The wrapper is also
 * the horizontal scroll viewport (`overflow-x: auto`), so a wide table scrolls
 * table-locally instead of overflowing the page and scrolling the editor gutter
 * away; {@link scrollElement} returns it so the selection/caret clipping
 * ({@link blockViewportClip}) measures that scroll box rather than the
 * content-sized `<table>`.
 */
class TableViewNode extends BlockViewNode<TableViewData> {
	private readonly _table: HTMLElement;

	constructor(data: TableViewData, options: BlockViewOptions | undefined, previous: TableViewNode | undefined) {
		const wrapper = (previous?.dom as HTMLElement | undefined) ?? document.createElement('div');
		const table = previous?._table ?? document.createElement('table');
		if (!previous) {
			wrapper.className = 'md-block md-table-wrapper';
			table.className = 'md-block md-table';
			wrapper.appendChild(table);
		}
		const children = reconcileDomChildren(table, _contentOf(data), previous?.children, _buildChild(options));
		super(data, wrapper, children);
		this._table = table;
	}

	override get element(): HTMLElement { return this._table; }

	override get scrollElement(): HTMLElement { return this.dom as HTMLElement; }
}

class TableRowViewNode extends BlockViewNode<TableRowViewData> {
	constructor(data: TableRowViewData, options: BlockViewOptions | undefined, previous: TableRowViewNode | undefined) {
		const tr = previous?.element ?? document.createElement('tr');
		if (data.isDelimiter) { tr.classList.add('md-table-delimiter-row'); }
		const children = reconcileDomChildren(tr, data.content, previous?.children, _buildChild(options));
		if (!data.isDelimiter) {
			data.content.forEach((cellData, i) => {
				if (cellData.kind === 'tableCell') {
					(children[i] as BlockViewNode).element.classList.toggle('md-table-cell-active', cellData.isActive);
				}
			});
		}
		super(data, tr, children);
	}
}

class InlineCodeViewNode extends BlockViewNode<InlineCodeViewData> {
	constructor(data: InlineCodeViewData, options: BlockViewOptions | undefined, previous: InlineCodeViewNode | undefined) {
		const code = previous?.element ?? document.createElement('code');
		const children = reconcileDomChildren(code, data.content, previous?.children, _inlineChild(options));
		super(data, code, children);
	}
}

class InlineMathViewNode extends BlockViewNode<InlineMathViewData> {
	constructor(data: InlineMathViewData, options: BlockViewOptions | undefined, previous: InlineMathViewNode | undefined) {
		if (data.showMarkup) {
			const span = document.createElement('span');
			span.className = 'md-inline-math';
			const children = reconcileDomChildren(span, data.content, previous?.children, _inlineChild(options));
			super(data, span, children);
			return;
		}
		const contentMarker = data.content.find(
			(c): c is MarkerViewData => c.kind === 'marker' && c.ast.markerKind === 'content',
		);
		const latex = contentMarker?.ast.content ?? '';
		const rendering = options?.renderMath?.({
			latex,
			displayMode: false,
			className: 'md-inline-math',
			nodeLength: data.ast.length,
			contentStart: _mathContentOffset(data.ast.content),
		});
		if (rendering) {
			super(data, rendering.dom, _buildMathSegmentChildren(data.ast, rendering.segments, data.ast.length));
			return;
		}
		const span = document.createElement('span');
		span.className = 'md-inline-math';
		try {
			katex.render(latex, span, { throwOnError: false });
		} catch {
			span.textContent = latex;
		}
		super(data, span, _NO_CHILDREN);
	}
}

class LinkViewNode extends BlockViewNode<LinkViewData> {
	private _presentation: ILinkPresentation | undefined;
	private _presentationSubscription: IDisposable | undefined;

	constructor(data: LinkViewData, options: BlockViewOptions | undefined, previous: LinkViewNode | undefined) {
		previous?._presentationSubscription?.dispose();
		if (previous) { previous._presentationSubscription = undefined; }
		previous?._presentation?.dispose();
		if (previous) { previous._presentation = undefined; }

		const presentation = !data.showMarkup && _isSafeUrl(data.ast.url)
			? options?.linkPresentationProvider?.createLinkPresentation(data.ast.url)
			: undefined;
		const tagName = presentation ? 'SPAN' : 'A';
		const element = previous?.element.tagName === tagName
			? previous.element
			: document.createElement(tagName.toLowerCase());
		if (_isSafeUrl(data.ast.url)) {
			element.dataset.mdUrl = data.ast.url;
			if (element instanceof HTMLAnchorElement) {
				element.href = data.ast.url;
			}
		} else {
			element.removeAttribute('href');
			delete element.dataset.mdUrl;
		}
		if (presentation) {
			element.setAttribute('role', 'link');
			element.tabIndex = 0;
		} else {
			element.removeAttribute('role');
			element.removeAttribute('tabindex');
		}
		// Wire the open-on-click affordance once per element (it persists across
		// reconciliation; the URL it opens is read live from `dataset.mdUrl`).
		// A plain click opens the link only while its block is inactive; once the
		// block is active (source shown) opening requires Ctrl/Cmd so a plain click
		// can place the caret to edit. Middle-click always opens.
		if (element !== previous?.element) {
			const shouldOpen = (e: MouseEvent): boolean => {
				if (!element.dataset.mdUrl) { return false; }
				// Only primary (open/place caret) and middle (always open) buttons.
				if (e.button !== 0 && e.button !== 1) { return false; }
				if (e.button === 1) { return true; }
				const blockActive = element.closest('.md-block-active') !== null;
				return !blockActive || e.ctrlKey || e.metaKey;
			};
			const openLink = (e: MouseEvent): boolean => {
				const url = element.dataset.mdUrl;
				if (!url) { return true; }
				const onOpenLink = options?.onOpenLink;
				if (!onOpenLink) {
					window.open(url, '_blank', 'noopener');
					return true;
				}
				return onOpenLink(url, e) !== false;
			};
			// Decide on `pointerdown`, while the block still reflects its pre-click
			// state, but open on `click` after the host frame has received focus.
			let shouldOpenFromPointerDown = false;
			element.addEventListener('pointerdown', (e) => {
				shouldOpenFromPointerDown = false;
				if (!shouldOpen(e)) { return; }
				e.stopPropagation();
				shouldOpenFromPointerDown = true;
			});
			const onClick = (e: MouseEvent): void => {
				const shouldOpenLink = shouldOpenFromPointerDown || shouldOpen(e);
				shouldOpenFromPointerDown = false;
				if (!shouldOpenLink) { return; }
				if (openLink(e)) {
					e.preventDefault();
					e.stopPropagation();
				}
			};
			element.addEventListener('click', onClick);
			element.addEventListener('auxclick', onClick);
			element.addEventListener('keydown', (e) => {
				if (element.getAttribute('role') !== 'link' || (e.key !== 'Enter' && e.key !== ' ')) {
					return;
				}
				e.preventDefault();
				element.click();
			});
		}
		let richLink: RichLink | undefined;
		const contentParent = presentation
			? (element.querySelector(':scope > .md-rich-link-label') as HTMLSpanElement | null) ?? document.createElement('span')
			: element;
		const children = reconcileDomChildren(contentParent, data.content, previous?.children, _buildChild(options));
		if (presentation) {
			richLink = RichLink.mount(element, contentParent);
		} else {
			RichLink.clear(element);
			_patchDomNodes(element, children.map(child => child.mountNode));
		}
		super(data, element, children);

		if (presentation && richLink) {
			this._presentation = presentation;
			const update = () => richLink!.update(presentation.presentation.get());
			update();
			this._presentationSubscription = runOnChange(presentation.presentation, update);
		}
	}

	override dispose(): void {
		this._presentationSubscription?.dispose();
		this._presentationSubscription = undefined;
		this._presentation?.dispose();
		this._presentation = undefined;
		super.dispose();
	}
}

class ImageViewNode extends BlockViewNode<ImageViewData> {
	constructor(data: ImageViewData, options: BlockViewOptions | undefined, previous: ImageViewNode | undefined) {
		const ast = data.ast;
		if (data.showMarkup) {
			const span = document.createElement('span');
			span.className = 'md-image-source';
			const children = reconcileDomChildren(span, data.content, previous?.children, _buildChild(options));
			super(data, span, children);
			return;
		}
		const img = document.createElement('img');
		if (_isSafeUrl(ast.url)) { img.src = ast.url; }
		img.alt = ast.alt;
		super(data, img, _NO_CHILDREN);
	}
}

/**
 * Pair each new node with the previous view node that should render it, then
 * report the previous nodes left over. Pairing is by {@link AstNode.id} — the
 * stable identity the parser mints on construction and carries across edits (see
 * `reconcile`). One key covers both reuse cases uniformly: an unchanged subtree
 * keeps its node object (so, trivially, its id), and an edited node — e.g. a
 * code block whose content changed — is rebuilt as a fresh object cloned with
 * its previous id. So the previous view node (which owns any DOM and, for a code
 * block, the highlighting session) is paired with the new view-data derived from
 * it, and that DOM/session is adopted rather than rebuilt.
 *
 * Previous nodes whose id no longer appears are returned in `unused`; the caller
 * disposes them (freeing any session they still own).
 */
export function pairNodes(
	newData: readonly AnyViewData[],
	prevNodes: readonly ViewNode[],
): { paired: Map<AnyViewData, ViewNode>; unused: ViewNode[] } {
	const byId = new Map<number, ViewNode>();
	for (const n of prevNodes) { byId.set(n.ast.id, n); }

	const paired = new Map<AnyViewData, ViewNode>();
	for (const d of newData) {
		const n = byId.get(d.ast.id);
		if (n) { paired.set(d, n); byId.delete(d.ast.id); }
	}

	return { paired, unused: [...byId.values()] };
}

function _isSafeUrl(url: string): boolean {
	return !url.trim().toLowerCase().startsWith('javascript:');
}
