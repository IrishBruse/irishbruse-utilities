import { Disposable } from '@vscode/observables';
import type { AstNode } from '../../parser/ast.js';
import { OffsetRange } from '../../core/offsetRange.js';
import type { DomPosition } from './dom.js';

export type { DomPosition } from './dom.js';

/**
 * Reverse index: the DOM node a view node renders → the view node. Written only
 * in the {@link ViewNode} constructor, so it always reflects the live tree (a
 * reused subtree keeps its entries; a rebuilt node overwrites its own). It lets
 * a hit-test result (an arbitrary DOM node deep inside, e.g. a KaTeX element)
 * be walked up via {@link ViewNode.forDom} to the closest owning view node
 * without scanning the tree.
 */
const _domToViewNode = new WeakMap<globalThis.Node, ViewNode>();

/**
 * Parent pointers, maintained incrementally: a node sets itself as the parent
 * of each of its children in its constructor. Because construction is
 * bottom-up and a reused subtree is never re-constructed, the only write per
 * frame is re-pointing each rebuilt node's direct children — O(reconciled
 * region), never the whole tree.
 */
const _parentOf = new WeakMap<ViewNode, ViewNode | undefined>();

/**
 * Immutable view of an AST node. Pairs `ast` with its rendered `dom` and a
 * mirror of `ast.children` as ViewNode children. Source offsets are NEVER
 * stored — they are recomputed by walking and summing `ast.length` of
 * preceding siblings, just like the AST itself.
 *
 * Leaves are ViewNodes with no children. A leaf whose `dom` is a Text node
 * participates in source mapping; a leaf whose `dom` is an Element does not
 * (e.g. KaTeX-rendered math, or `<hr>` for a thematic break).
 */
export class ViewNode extends Disposable {
    private _children: readonly ViewNode[];

    constructor(
        readonly ast: AstNode,
        readonly dom: globalThis.Node,
        children: readonly ViewNode[] = _emptyChildren,
    ) {
        super();
        this._children = children;
        _domToViewNode.set(dom, this);
        for (const child of children) { _parentOf.set(child, this); }
    }

    /** This node's view children (a mirror of `ast.children`). */
    get children(): readonly ViewNode[] { return this._children; }

    /**
     * Replace this node's children in place, disposing the old ones and
     * re-pointing the new ones' parent to this node. The node value is still
     * conceptually immutable with respect to its `ast`/`dom` *identity*; this
     * is used only when a node patches its own DOM subtree in place (a code
     * block re-tokenising on a highlighter recolour), where the source-mapping
     * leaves must follow the new DOM text nodes without rebuilding the node
     * itself.
     */
    protected _replaceChildren(children: readonly ViewNode[]): void {
        for (const child of this._children) { child.dispose(); }
        this._children = children;
        for (const child of children) { _parentOf.set(child, this); }
    }

    dispose(): void {
        for (const child of this._children) { child.dispose(); }
    }

    /**
     * The number of source characters this node spans. Defaults to the length
     * of its {@link ast}; a synthetic leaf that subdivides one ast node (a
     * decorated-whitespace character, a code-block token span) shares that ast
     * for identity but overrides this with the length of its own slice, so the
     * renderer never has to fabricate an AST node just to carry a length.
     */
    get sourceLength(): number { return this.ast.length; }

    /**
     * The DOM node a parent mounts for this child. It is {@link dom} for almost
     * everything; a marker is the exception — its `dom` is the inner Text node
     * (so source ↔ DOM mapping lands on it) while the node it mounts is the
     * wrapping `<span>`.
     */
    get mountNode(): globalThis.Node { return this.dom; }

    /** The view node that rendered this node's parent, or `undefined` for a root. */
    get parent(): ViewNode | undefined { return _parentOf.get(this); }

    /**
     * Closest view node owning `domNode`: the node itself if registered, else
     * the nearest registered ancestor. Returns `undefined` if the DOM node is
     * outside any view tree.
     */
    static forDom(domNode: globalThis.Node | null): ViewNode | undefined {
        for (let n: globalThis.Node | null = domNode; n; n = n.parentNode) {
            const vn = _domToViewNode.get(n);
            if (vn) { return vn; }
        }
        return undefined;
    }

    /**
     * This node's start offset within its parent's local source space: the sum
     * of the `ast.length` of the siblings before it. Polymorphic via
     * {@link _localOffsetOfChild} so a parent whose children do not map
     * linearly (e.g. it hides or reorders some) can override how its children
     * are placed.
     */
    localOffsetInParent(): number {
        const p = this.parent;
        return p ? p._localOffsetOfChild(this) : 0;
    }

    /** Start offset of `child` within this node's local source space. */
    protected _localOffsetOfChild(child: ViewNode): number {
        let offset = 0;
        for (const c of this.children) {
            if (c === child) { return offset; }
            offset += c.sourceLength;
        }
        return offset;
    }

    /**
     * Map a DOM hit that lands on THIS node's own representation into a source
     * range in this node's local space `[0, ast.length)`. Polymorphic: a text
     * leaf maps the caret offset 1:1. For an element hit — an element-only node
     * (KaTeX math, `<hr>`, an image, a hidden marker) or a wrapper/container
     * element — the platform reports a child-index offset, not a text caret, so
     * there is no internal mapping to honour: it snaps to the node's nearer
     * edge, `offset 0` (the "before" side) → start, any `offset >= 1` (the
     * "after" side) → end. Subclasses may override for finer control.
     */
    getLocalSourceRange(pos: DomPosition): OffsetRange {
        if (this.dom === pos.node && this.dom.nodeType === 3 /* TEXT_NODE */) {
            return OffsetRange.emptyAt(Math.max(0, Math.min(pos.offset, this.sourceLength)));
        }
        return OffsetRange.emptyAt(pos.offset >= 1 ? this.sourceLength : 0);
    }

    /**
     * DOM hit (any node + offset within it) → source offset relative to THIS
     * node, or `undefined` when the hit is outside this node's subtree. Enters
     * the tree at the closest owning view node ({@link forDom}), maps the hit
     * into that node's local space ({@link getLocalSourceRange}), then lifts the
     * range up the parent chain — adding each node's {@link localOffsetInParent} —
     * until it reaches this node.
     */
    resolveSource(pos: DomPosition): number | undefined {
        let node: ViewNode | undefined = ViewNode.forDom(pos.node);
        if (!node) { return undefined; }
        let range = node.getLocalSourceRange(pos);
        while (node !== this) {
            const p: ViewNode | undefined = node.parent;
            if (!p) { return undefined; }
            range = range.delta(node.localOffsetInParent());
            node = p;
        }
        return range.start;
    }

    /**
     * Source offset → DOM position. `nodeOffset` is the absolute source
     * offset of THIS node's start. Returns a position into a DOM Text node,
     * descending into children based on accumulated lengths.
     */
    sourceToDom(localSourceOffset: number, nodeSourceOffset: number = 0): DomPosition | undefined {
        if (localSourceOffset < nodeSourceOffset || localSourceOffset > nodeSourceOffset + this.sourceLength) {
            return undefined;
        }
        if (this.children.length === 0) {
            if (this.dom.nodeType === 3 /* TEXT_NODE */) {
                return { node: this.dom as Text, offset: localSourceOffset - nodeSourceOffset };
            }
            return undefined;
        }
        let childOffset = nodeSourceOffset;
        for (const child of this.children) {
            const childEnd = childOffset + child.sourceLength;
            if (localSourceOffset >= childOffset && localSourceOffset <= childEnd) {
                const result = child.sourceToDom(localSourceOffset, childOffset);
                if (result) { return result; }
            }
            childOffset = childEnd;
        }
        return undefined;
    }

    /** Visit every text-bearing leaf in this subtree with its absolute offset. */
    forEachTextLeaf(nodeOffset: number, visitor: (leaf: ViewNode, leafOffset: number) => void): void {
        if (this.children.length === 0) {
            if (this.dom.nodeType === 3 /* TEXT_NODE */) {
                visitor(this, nodeOffset);
            }
            return;
        }
        let childOffset = nodeOffset;
        for (const child of this.children) {
            child.forEachTextLeaf(childOffset, visitor);
            childOffset += child.sourceLength;
        }
    }
}

const _emptyChildren: readonly ViewNode[] = [];

