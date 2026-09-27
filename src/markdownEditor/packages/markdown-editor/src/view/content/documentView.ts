import type { AnyViewData, DocumentViewData, PendingParagraphViewData } from '../viewData.js';
import type { DocumentAstNode } from '../../parser/ast.js';
import type { BlockAstNode } from '../../parser/ast.js';
import type { VirtualCursorLine } from '../../core/cursorPosition.js';
import { BlockViewNode, createViewNode, pairNodes, _patchDomNodes, type BlockViewOptions } from './blockView.js';
import { ViewNode } from './viewNode.js';

/** A mounted block: its view node paired with where it starts in the source. */
export interface DocumentBlock {
    readonly node: BlockViewNode;
    readonly absoluteStart: number;
}

/**
 * Immutable view of the document's block sequence — the document-level
 * analogue of {@link BlockViewNode}. Each {@link create} maps the
 * {@link DocumentViewData} (the AST overlaid with selection-derived flags) to
 * the block sequence, reusing the previous node's blocks by view-data identity,
 * rebuilding only what changed, and patching its {@link contentDomNode}'s
 * children to match.
 *
 * Like a {@link BlockViewNode}, it owns its DOM: the first `create` allocates
 * the content element, and every later `create` keeps the previous node's
 * element rather than making a new one. The element is therefore stable
 * across rebuilds:
 *
 *     create(viewData, …, old).contentDomNode === old.contentDomNode
 *
 * so a parent can mount it once and never re-parent it.
 *
 * Because it is rebuilt rather than mutated, {@link EditorView} can hold the
 * whole block cache as one value and simply swap it each frame, instead of
 * carrying a mutable entry array and the reconcile bookkeeping itself.
 *
 * It is itself a {@link ViewNode} (the root of the view-node tree), so DOM ↔
 * source mapping such as {@link ViewNode.resolveSource} is inherited: a hit on
 * any descendant lifts up the parent chain to here, yielding an absolute
 * document offset.
 */
export class DocumentViewNode extends ViewNode {
    static create(
        viewData: DocumentViewData,
        options: BlockViewOptions | undefined,
        previous: DocumentViewNode | undefined,
    ): DocumentViewNode {
        const originalCreate = (
            viewData: DocumentViewData,
            options: BlockViewOptions | undefined,
            previous: DocumentViewNode | undefined,
        ): DocumentViewNode => {
        const contentDomNode = previous?.contentDomNode ?? document.createElement('div');
        contentDomNode.classList.add('md-document');
        const activeByView = new Map<AnyViewData, boolean>(
            viewData.children.filter(c => c.kind === 'block').map(c => [c.view as AnyViewData, c.isActive]),
        );

        // Build every child (blocks and any leading/standalone glue) in source
        // order, pairing each with the previous node that rendered it so reused
        // nodes keep their DOM, and disposing the leftovers. A block's trailing
        // `blockGap` glue is part of the block's own content now (the parser
        // attributes it there), so it is mounted at the end of the block's last
        // line by the block's own reconciliation — no document-level reparenting.
        const prevNodes = previous?.children;
        const childViews = viewData.children.map(c => c.view);
        const { paired, unused } = pairNodes(childViews as readonly AnyViewData[], prevNodes ?? _NO_NODES);
        let pendingParagraph: PendingParagraphViewNode | undefined;
        const nodes = childViews.map((view, i) => {
            const prev = paired.get(view as AnyViewData);
            // The transient empty paragraph is not an AST-backed block, so it is
            // built here rather than through `createViewNode` and measured as a
            // source-less visual line. It reuses its previous element while armed.
            if (viewData.children[i].kind === 'pendingParagraph') {
                const pendingView = view as PendingParagraphViewData;
                const node = prev instanceof PendingParagraphViewNode
                    ? prev
                    : new PendingParagraphViewNode(pendingView);
                node.update(pendingView.text);
                pendingParagraph = node;
                return node;
            }
            const node = createViewNode(view as AnyViewData, options, prev);
            // The active/markers-hidden classes are a top-level concern (the
            // block's own markers are handled within its subtree), so they are
            // applied here rather than inside the node. Glue carries no such
            // classes, so it is left untouched.
            if (viewData.children[i].kind === 'block') {
                const isActive = activeByView.get(view as AnyViewData);
                if (isActive !== undefined) {
                    (node as BlockViewNode).element.classList.toggle('md-block-active', isActive);
                    (node as BlockViewNode).element.classList.toggle('md-markers-hidden', !isActive);
                }
                // Green band on a changed modified block (diff mode); no-op otherwise.
                const diffKind = viewData.children[i].diffKind;
                (node as BlockViewNode).element.classList.toggle('md-diff-added', diffKind === 'added');
                (node as BlockViewNode).element.classList.toggle('md-diff-modified', diffKind === 'modified');
            }
            return node;
        });
        for (const u of unused) { u.dispose(); }

        _patchDomNodes(contentDomNode, nodes.map(n => n.mountNode));

        const blocks: DocumentBlock[] = [];
        viewData.children.forEach((c, i) => {
            if (c.kind === 'block') { blocks.push({ node: nodes[i] as BlockViewNode, absoluteStart: c.absoluteStart }); }
        });
        return new DocumentViewNode(viewData.ast, contentDomNode, blocks, nodes, pendingParagraph);
        };
        const hook = (globalThis as { __ibMdDocumentViewCreate?: (...args: unknown[]) => unknown }).__ibMdDocumentViewCreate;
        if (typeof hook === 'function') {
            return hook(viewData, options, previous, {
                originalCreate,
                createViewNode,
                patchDomNodes: _patchDomNodes,
                pairNodes,
                emptyNodes: _NO_NODES,
                PendingParagraph: PendingParagraphViewNode,
                DocumentViewNode,
            }) as DocumentViewNode;
        }
        return originalCreate(viewData, options, previous);
    }

    private constructor(
        ast: DocumentAstNode,
        contentDomNode: HTMLElement,
        readonly blocks: readonly DocumentBlock[],
        /** Every mounted child (blocks and glue) in source order. */
        nodes: readonly ViewNode[],
        /** The transient empty-paragraph element, when one is armed. */
        readonly pendingParagraph?: PendingParagraphViewNode,
    ) {
        super(ast, contentDomNode, nodes);
    }

    /** The stable content element this document mounts its children into. */
    get contentDomNode(): HTMLElement { return this.dom as HTMLElement; }
}

/**
 * The mounted transient empty paragraph: a `<p class="md-pending-paragraph">`
 * holding either a `<br>` or decorated transient horizontal whitespace. It is a
 * leaf view node with no inline source content; the document view publishes its
 * element geometry as a virtual visual line.
 */
export class PendingParagraphViewNode extends ViewNode {
    readonly element: HTMLElement;
    readonly anchorBlock: BlockAstNode;
    readonly cursorLine: VirtualCursorLine;
    private _text = '';

    constructor(view: PendingParagraphViewData) {
        const p = document.createElement('p');
        p.className = 'md-block md-paragraph md-pending-paragraph';
        super(view.ast, p);
        this.element = p;
        this.anchorBlock = view.anchorBlock;
        this.cursorLine = view.cursorLine;
        this.update(view.text);
    }

    update(text: string): void {
        if (text === this._text && this.element.childNodes.length > 0) { return; }
        this._text = text;
        if (text.length === 0) {
            this.element.replaceChildren(document.createElement('br'));
            return;
        }
        this.element.replaceChildren(...[...text].map(char => {
            const span = document.createElement('span');
            span.className = char === ' ' ? 'md-ws-space' : 'md-ws-tab';
            span.textContent = char;
            return span;
        }));
    }

    getCaretClientRect(): DOMRect {
        const lineRect = this.element.getBoundingClientRect();
        if (this._text.length === 0) {
            return new DOMRect(lineRect.left, lineRect.top, 0, lineRect.height);
        }

        const range = this.element.ownerDocument.createRange();
        range.selectNodeContents(this.element);
        range.collapse(false);
        const rangeRect = range.getBoundingClientRect();
        if (rangeRect.height > 0) { return rangeRect; }

        const lastRect = this.element.lastElementChild?.getBoundingClientRect();
        return new DOMRect(lastRect?.right ?? lineRect.left, lineRect.top, 0, lineRect.height);
    }
}

const _NO_NODES: readonly ViewNode[] = [];
