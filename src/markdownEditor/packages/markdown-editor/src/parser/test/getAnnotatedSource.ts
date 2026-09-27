/**
 * Renders a node as XML-annotated source: every container becomes a
 * `<kind …>` element wrapping its children, leaves render their literal source
 * text, and {@link GlueAstNode}/{@link TextAstNode} render as raw text (no tag). This mirrors
 * the original parser's annotated-source format, adapted to the computed-
 * `children` + explicit-glue AST.
 */

import {
    CodeBlockAstNode, GlueAstNode, HeadingAstNode, ImageAstNode, LinkAstNode, ListAstNode, ListItemAstNode, MarkerAstNode, TextAstNode, UnhandledBlockAstNode, VideoAstNode, type AstNode,
} from '../ast.js';

export function getAnnotatedSource(node: AstNode, source: string, offset: number = 0): string {
    if (node.children.length === 0) {
        const text = escapeXml(source.substring(offset, offset + node.length));
        if (node instanceof TextAstNode) { return text; }
        const tag = node instanceof MarkerAstNode ? node.markerKind : node.kind;
        return `<${tag}${_attributes(node)}>${text}</${tag}>`;
    }

    let result = '';
    let childOffset = offset;
    for (const child of node.children) {
        result += getAnnotatedSource(child, source, childOffset);
        childOffset += child.length;
    }
    return `<${node.kind}${_attributes(node)}>${result}</${node.kind}>`;
}

function _attributes(node: AstNode): string {
    const attrs: Record<string, string> = {};
    if (node instanceof HeadingAstNode) { attrs.level = String(node.level); }
    else if (node instanceof ListAstNode) { attrs.ordered = String(node.ordered); }
    else if (node instanceof CodeBlockAstNode) { if (node.language) { attrs.language = node.language; } }
    else if (node instanceof LinkAstNode) { attrs.url = node.url; }
    else if (node instanceof ImageAstNode) { attrs.alt = node.alt; attrs.url = node.url; }
    else if (node instanceof VideoAstNode) {
        attrs.src = node.attributes.src;
        if (node.attributes.title !== undefined) { attrs.title = node.attributes.title; }
        if (node.attributes.autoplay) { attrs.autoplay = 'true'; }
        if (node.attributes.controls) { attrs.controls = 'true'; }
        if (node.attributes.loop) { attrs.loop = 'true'; }
        if (node.attributes.muted) { attrs.muted = 'true'; }
    }
    else if (node instanceof ListItemAstNode) { if (node.checked !== undefined) { attrs.checked = String(node.checked); } }
    else if (node instanceof UnhandledBlockAstNode) { attrs.token = node.tokenType; }
    else if (node instanceof GlueAstNode) { if (node.glueKind) { attrs.kind = node.glueKind; } }
    return Object.entries(attrs).map(([k, v]) => ` ${k}="${escapeXml(v)}"`).join('');
}

function escapeXml(str: string): string {
    return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
