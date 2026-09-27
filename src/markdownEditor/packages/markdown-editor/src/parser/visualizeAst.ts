/**
 * Adapts a parsed {@link AstNode} tree into the `ast.w` visualization payload
 * consumed by the web AST viewer
 * (`https://microsoft.github.io/vscode-web-editor-text-tools/?editor=ast-viewer`).
 *
 * The tree is dense and ordered — every node's `length` is the sum of its
 * children's lengths and siblings are contiguous — so source offsets are just a
 * running cursor threaded through a depth-first walk. No offset table or
 * per-node length arithmetic is needed beyond advancing past leaf text.
 */

import {
    AstNode, CodeBlockAstNode, GlueAstNode, HeadingAstNode, ImageAstNode, LinkAstNode,
    ListAstNode, ListItemAstNode, MarkerAstNode, MathBlockAstNode, TextAstNode, ThematicBreakAstNode, VideoAstNode,
} from './ast.js';
import { tokenize } from './_micromarkAdapter.js';

export interface AstVisualizationNode {
    label: string;
    range: [start: number, endExclusive: number];
    children?: AstVisualizationNode[];
}

export interface AstVisualization {
    $fileExtension: 'ast.w';
    source: string;
    root: AstVisualizationNode;
}

function _label(n: AstNode): string {
    if (n instanceof TextAstNode) { return `text ${JSON.stringify(n.content)}`; }
    if (n instanceof GlueAstNode) { return `glue${n.glueKind ? `(${n.glueKind})` : ''} ${JSON.stringify(n.content)}`; }
    if (n instanceof MarkerAstNode) { return `marker(${n.markerKind}) ${JSON.stringify(n.content)}`; }
    if (n instanceof ThematicBreakAstNode) { return `thematicBreak ${JSON.stringify(n.content)}`; }
    if (n instanceof HeadingAstNode) { return `heading(level=${n.level})`; }
    if (n instanceof ListAstNode) { return `list(ordered=${n.ordered})`; }
    if (n instanceof ListItemAstNode) { return n.checked === undefined ? 'listItem' : `listItem(checked=${n.checked})`; }
    if (n instanceof CodeBlockAstNode) { return `codeBlock(language=${JSON.stringify(n.language)})`; }
    if (n instanceof MathBlockAstNode) { return 'mathBlock'; }
    if (n instanceof LinkAstNode) { return `link(url=${JSON.stringify(n.url)})`; }
    if (n instanceof ImageAstNode) { return `image(alt=${JSON.stringify(n.alt)}, url=${JSON.stringify(n.url)})`; }
    if (n instanceof VideoAstNode) { return `video(src=${JSON.stringify(n.attributes.src)})`; }
    return n.kind;
}

const _objectInstanceIds = new WeakMap<object, number>();
let _nextObjectInstanceId = 0;

/**
 * Globally-stable per-object-instance id, assigned in first-seen order across
 * every visualization (AST, view-data, view-node). A single registry — not one
 * per tree — is the whole point: the same object always renders the same `#N`,
 * so you can correlate instances across the different trees and across edits.
 */
export function objectInstanceId(n: object): number {
    let id = _objectInstanceIds.get(n);
    if (id === undefined) { id = _nextObjectInstanceId++; _objectInstanceIds.set(n, id); }
    return id;
}

export function visualizeAst(root: AstNode, source: string): AstVisualization {
    let pos = 0;
    function walk(n: AstNode): AstVisualizationNode {
        const start = pos;
        const kids = n.children;
        let children: AstVisualizationNode[] | undefined;
        if (kids.length === 0) {
            pos += n.length;
        } else {
            children = kids.map(walk);
        }
        const label = `${_label(n)}  #${objectInstanceId(n)} nid=${n.id}`;
        return { label, range: [start, pos], children };
    }
    return { $fileExtension: 'ast.w', source, root: walk(root) };
}

/**
 * Adapts the raw micromark token stream into the same `ast.w` visualization
 * payload, as a flat list (no nesting): one child per event, in document order.
 * This is the input the {@link visualizeAst} tree is built from, so showing both
 * side by side makes the parser's tokens → AST step inspectable.
 *
 * Both `enter` and `exit` events are emitted — the open/close structure is the
 * one piece of micromark's information that is NOT derivable from a flat list of
 * ranges (tokens can share a range, and ranges alone don't disambiguate nesting
 * order). Everything else a token carries is here too: its type, its
 * `[start, end)` range, and the source slice that range covers (so the length,
 * which the AST view derives, is visible directly).
 */
export function visualizeTokens(source: string): AstVisualization {
    const children: AstVisualizationNode[] = [];
    for (const ev of tokenize(source)) {
        const text = source.substring(ev.startOffset, ev.endOffset);
        children.push({
            label: `${ev.type} ${ev.tokenType} ${JSON.stringify(text)}`,
            range: [ev.startOffset, ev.endOffset],
        });
    }
    const root: AstVisualizationNode = {
        label: `events (${children.length})`,
        range: [0, source.length],
        children,
    };
    return { $fileExtension: 'ast.w', source, root };
}
