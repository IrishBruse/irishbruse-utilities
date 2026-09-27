/**
 * Full-grammar parser for the prototype AST. Tokenizes with micromark (via the
 * shared adapter) and distills the event stream into the computed-`children`
 * AST. Spans no token claims become explicit {@link GlueAstNode}, so every node's
 * `content` tiles its source range exactly and contiguously — the property
 * that makes offset-based reconciliation sound.
 */

import { decodeHTMLAttribute } from 'entities/decode';
import { OffsetRange } from '../core/offsetRange.js';
import {
    BlockAstNodeBase, BlockQuoteAstNode, CodeBlockAstNode, DocumentAstNode, EmphasisAstNode, GlueAstNode, HeadingAstNode, ImageAstNode, InlineCodeAstNode,
    FrontMatterAstNode, InlineMathAstNode, LinkAstNode, ListAstNode, ListItemAstNode, MarkerAstNode, MathBlockAstNode, AstNode, ParagraphAstNode,
    StrikethroughAstNode, StrongAstNode, TableAstNode, TableCellAstNode, TableRowAstNode, TextAstNode, ThematicBreakAstNode, UnhandledBlockAstNode, VideoAstNode,
    type BlockAstNode, type VideoAttributes,
} from './ast.js';
import { tokenize, type MicromarkEvent } from './_micromarkAdapter.js';

export function parse(source: string): DocumentAstNode {
    return new AstBuilder(tokenize(source), source).build();
}

/**
 * Block-level micromark tokens we do not model but that carry real content
 * worth preserving verbatim (a setext heading or link-reference definition).
 * Raw HTML is handled separately so supported standalone video elements can be
 * modeled before all other HTML falls back to source. When one appears where a
 * block is expected — at the document top level or inside a list item / block
 * quote — it is captured as an {@link UnhandledBlockAstNode} instead of being
 * dropped.
 *
 * Deliberately an allowlist, not a denylist: every *structural* token (line
 * endings, `linePrefix`, `blockQuotePrefix`, `listItemIndent`, …) is simply
 * stepped over and tiles as glue, exactly as before. Enumerating the constructs
 * we fall back on — rather than "anything unrecognized" — keeps the many
 * whitespace/prefix tokens from being mistaken for content. To support a new
 * construct, either parse it properly or add its token here.
 */
const _UNHANDLED_BLOCK_TOKENS: ReadonlySet<string> = new Set([
    'setextHeading', 'definition',
]);

type Entry = { node: AstNode; start: number };

type VideoBlockClassification =
    | { readonly kind: 'notVideo' }
    | { readonly kind: 'supported'; readonly attributes: VideoAttributes }
    | { readonly kind: 'unsupported' };

const _NOT_VIDEO = { kind: 'notVideo' } as const;
const _UNSUPPORTED_VIDEO = { kind: 'unsupported' } as const;

interface ParsedHtmlAttribute {
    readonly name: string;
    readonly value?: string;
}

function _classifyVideoBlock(source: string): VideoBlockClassification {
    let offset = _skipHtmlWhitespace(source, 0);
    if (!_startsWithVideoCandidate(source, offset)) { return _NOT_VIDEO; }
    offset += '<video'.length;

    const nameBoundary = source[offset];
    if (nameBoundary !== undefined && nameBoundary !== '>' && nameBoundary !== '/' && !_isHtmlWhitespace(nameBoundary)) {
        return _UNSUPPORTED_VIDEO;
    }

    const parsed: ParsedHtmlAttribute[] = [];
    let openingTagComplete = false;
    while (offset < source.length) {
        const beforeWhitespace = offset;
        offset = _skipHtmlWhitespace(source, offset);
        if (source[offset] === '>') {
            openingTagComplete = true;
            offset++;
            break;
        }
        if (offset === beforeWhitespace || !_isHtmlAttributeNameStart(source[offset])) { return _UNSUPPORTED_VIDEO; }

        const nameStart = offset;
        offset++;
        while (_isHtmlAttributeNameCharacter(source[offset])) { offset++; }
        const name = source.slice(nameStart, offset).toLowerCase();

        const afterName = offset;
        const equalsOffset = _skipHtmlWhitespace(source, offset);
        let value: string | undefined;
        if (source[equalsOffset] === '=') {
            offset = _skipHtmlWhitespace(source, equalsOffset + 1);
            const quote = source[offset];
            if (quote === '"' || quote === '\'') {
                const valueStart = ++offset;
                while (offset < source.length && source[offset] !== quote) { offset++; }
                if (source[offset] !== quote) { return _UNSUPPORTED_VIDEO; }
                value = source.slice(valueStart, offset);
                offset++;
            } else {
                const valueStart = offset;
                while (offset < source.length && !_isHtmlWhitespace(source[offset]) && source[offset] !== '>') {
                    const character = source[offset];
                    if (character === '"' || character === '\'' || character === '`' || character === '<' || character === '=') {
                        return _UNSUPPORTED_VIDEO;
                    }
                    offset++;
                }
                if (offset === valueStart) { return _UNSUPPORTED_VIDEO; }
                value = source.slice(valueStart, offset);
            }
        } else {
            offset = afterName;
        }
        parsed.push({ name, value });
    }
    if (!openingTagComplete) { return _UNSUPPORTED_VIDEO; }

    offset = _skipHtmlWhitespace(source, offset);
    if (!_startsWithAsciiCaseInsensitive(source, offset, '</video')) { return _UNSUPPORTED_VIDEO; }
    offset += '</video'.length;
    offset = _skipHtmlWhitespace(source, offset);
    if (source[offset] !== '>') { return _UNSUPPORTED_VIDEO; }
    offset = _skipHtmlWhitespace(source, offset + 1);
    if (offset !== source.length) { return _UNSUPPORTED_VIDEO; }

    let src: string | undefined;
    let title: string | undefined;
    let autoplay = false;
    let controls = false;
    let loop = false;
    let muted = false;
    const seenNames = new Set<string>();
    for (const { name, value } of parsed) {
        if (seenNames.has(name)) { return _UNSUPPORTED_VIDEO; }
        seenNames.add(name);
        switch (name) {
            case 'src':
                if (value === undefined) { return _UNSUPPORTED_VIDEO; }
                src = decodeHTMLAttribute(value);
                if (_containsOnlyHtmlWhitespace(src)) { return _UNSUPPORTED_VIDEO; }
                break;
            case 'title':
                if (value === undefined) { return _UNSUPPORTED_VIDEO; }
                title = decodeHTMLAttribute(value);
                break;
            case 'autoplay':
                autoplay = true;
                break;
            case 'controls':
                controls = true;
                break;
            case 'loop':
                loop = true;
                break;
            case 'muted':
                muted = true;
                break;
            default:
                return _UNSUPPORTED_VIDEO;
        }
    }
    if (src === undefined) { return _UNSUPPORTED_VIDEO; }
    return {
        kind: 'supported',
        attributes: { src, title, autoplay, controls, loop, muted },
    };
}

function _skipHtmlWhitespace(source: string, offset: number): number {
    while (_isHtmlWhitespace(source[offset])) { offset++; }
    return offset;
}

function _containsOnlyHtmlWhitespace(source: string): boolean {
    return _skipHtmlWhitespace(source, 0) === source.length;
}

function _isHtmlWhitespace(character: string | undefined): boolean {
    return character === ' ' || character === '\t' || character === '\n' || character === '\r' || character === '\f';
}

function _isHtmlAttributeNameStart(character: string | undefined): boolean {
    return character !== undefined && /[A-Za-z]/.test(character);
}

function _isHtmlAttributeNameCharacter(character: string | undefined): boolean {
    return character !== undefined && /[A-Za-z0-9:_-]/.test(character);
}

function _startsWithAsciiCaseInsensitive(source: string, offset: number, expected: string): boolean {
    return source.slice(offset, offset + expected.length).toLowerCase() === expected;
}

function _startsWithVideoCandidate(source: string, offset: number): boolean {
    if (!_startsWithAsciiCaseInsensitive(source, offset, '<video')) { return false; }
    return !_isHtmlAttributeNameCharacter(source[offset + '<video'.length]);
}

/**
 * Re-attributes an `indent` glue (the spaces after a line break) onto the block
 * it precedes, as that block's leading trivia, so the whitespace tiles and
 * renders on the indented block's own line (revealed when *it* is active) rather
 * than trailing the previous one:
 *  - before a {@link ListAstNode}: onto that list's first item,
 *  - before a {@link ListItemAstNode}: onto that item,
 *  - before any other {@link BlockAstNodeBase}: onto the block itself,
 * all via the node's `leadingTrivia` slot. An indent glue with no such host is
 * merged back into the preceding line-break glue, so it never renders as a
 * standalone run between blocks. Offsets stay exact: the glue keeps its source
 * span, it just moves inside (or back into) a sibling.
 */
function _pullIndentIntoBlocks<T extends AstNode>(content: readonly T[]): T[] {
    const out: T[] = [];
    for (let i = 0; i < content.length; i++) {
        const cur = content[i];
        const next = content[i + 1];
        if (cur instanceof GlueAstNode && cur.glueKind === 'indent') {
            const hosted = next !== undefined ? _prependLeadingTrivia(next, cur) : undefined;
            if (hosted) {
                out.push(hosted as unknown as T);
                i++;
                continue;
            }
            // No host for the indentation: fold it back into the preceding
            // line break so it stays hidden rather than rendering as dots.
            const prev = out[out.length - 1];
            if (prev instanceof GlueAstNode && prev.glueKind === undefined) {
                out[out.length - 1] = new GlueAstNode(prev.content + cur.content) as unknown as T;
                continue;
            }
            out.push(cur);
            continue;
        }
        out.push(cur);
    }
    return out;
}

/**
 * Hosts `glue` as the leading trivia of `next` when `next` can carry it — a
 * list (onto its first item), a list item, or any block — returning the rebuilt
 * node, or `undefined` when `next` cannot host leading trivia.
 */
function _prependLeadingTrivia(next: AstNode, glue: GlueAstNode): AstNode | undefined {
    if (next instanceof ListAstNode) {
        const firstIdx = next.content.findIndex(n => n instanceof ListItemAstNode);
        if (firstIdx < 0) { return undefined; }
        const items = next.content.map((n, j) => (j === firstIdx ? (n as ListItemAstNode).withLeadingTrivia(glue) : n));
        return new ListAstNode(next.ordered, items, next.leadingTrivia);
    }
    if (next instanceof ListItemAstNode) { return next.withLeadingTrivia(glue); }
    if (next instanceof BlockAstNodeBase) { return next.withLeadingTrivia(glue); }
    return undefined;
}

/**
 * Re-attributes every plain document-level glue — the blank lines and trailing
 * newlines that separate top-level blocks — onto the block it follows, as a
 * trailing glue appended to that block's own `content`. The view then reveals
 * the gap (character-for-character) exactly when that preceding block is active,
 * and renders it at the end of the block rather than as a standalone run between
 * blocks.
 *
 * The gap is tagged by what it does:
 *  - `blockBreak` — it separates two *paragraphs* (`para\n\npara`), the only
 *    case where deleting a newline merges the blocks: the two paragraphs fuse
 *    into one and the surviving newline re-parses as an ordinary soft break.
 *    The view paints its leading newline as a distinct (blue) glyph. A heading
 *    or any other block self-delimits after a single newline, so a gap after it
 *    (or before a non-paragraph) is structurally inert and is *not* a break.
 *  - `blockGap` — every other gap: after a non-paragraph block, before a
 *    non-paragraph block, a trailing gap with no following block, or a
 *    leading/hostless gap (one at the very start of the document, before the
 *    first block, with no preceding block to host it).
 *    Its newlines are neutral.
 *
 * Only untagged glue is touched (an `indent` glue keeps its kind); offsets are
 * untouched — the glue keeps its source span, it just moves inside the preceding
 * block.
 */
function _attachBlockGaps<T extends AstNode>(content: readonly (T | GlueAstNode)[]): (T | GlueAstNode)[] {
    const out: (T | GlueAstNode)[] = [];
    for (let idx = 0; idx < content.length; idx++) {
        const n = content[idx];
        if (
            n instanceof GlueAstNode
            && (n.glueKind === undefined || n.glueKind === 'blockQuoteSourceGap')
        ) {
            const prev = out[out.length - 1];
            const next = content[idx + 1];
            // A break only exists between two paragraphs: that is the sole gap
            // whose deletion merges the blocks. After a heading (or before any
            // non-paragraph) the gap is structurally inert, so it stays neutral.
            const isParagraphBreak = prev instanceof ParagraphAstNode && next instanceof ParagraphAstNode;
            const gap = new GlueAstNode(
                n.content,
                n.glueKind === 'blockQuoteSourceGap'
                    ? 'blockQuoteSourceGap'
                    : isParagraphBreak ? 'blockBreak' : 'blockGap',
            );
            const host = prev !== undefined ? _appendTrailingGlue(prev, gap) : undefined;
            if (host) { out[out.length - 1] = host as T | GlueAstNode; } else { out.push(gap); }
            continue;
        }
        out.push(n);
    }
    return out;
}

/**
 * Returns `node` rebuilt with `glue` consumed as its trailing trivia — the
 * greedy-block rule: a block (and the item/quote that hosts it) swallows the
 * whitespace that follows it, exactly like a recursive-descent scanner attaches
 * trailing trivia to the token it just read. Leaf blocks append `glue` to their
 * own `content`; containers ({@link BlockQuoteAstNode}, {@link ListAstNode},
 * {@link ListItemAstNode}) recurse into their last child so the glue lands at the
 * end of the deepest trailing paragraph. Returns `undefined` when `node` cannot
 * host trailing glue (a leaf marker, a glue, an inline), so the caller keeps the
 * gap standalone.
 */
function _appendTrailingGlue(node: AstNode, glue: GlueAstNode): AstNode | undefined {
    switch (node.kind) {
        case 'paragraph': { const p = node as ParagraphAstNode; return new ParagraphAstNode([...p.content, glue], p.leadingTrivia); }
        case 'heading': { const h = node as HeadingAstNode; return new HeadingAstNode(h.level, h.marker, [...h.content, glue], h.leadingTrivia); }
        case 'codeBlock': { const c = node as CodeBlockAstNode; return new CodeBlockAstNode(c.language, c.infoString, [...c.content, glue], c.leadingTrivia); }
        case 'frontMatter': { const f = node as FrontMatterAstNode; return new FrontMatterAstNode([...f.content, glue], f.leadingTrivia); }
        case 'mathBlock': { const m = node as MathBlockAstNode; return new MathBlockAstNode([...m.content, glue], m.leadingTrivia); }
        case 'thematicBreak': { const t = node as ThematicBreakAstNode; return new ThematicBreakAstNode([...t.content, glue], t.leadingTrivia); }
        case 'video': { const v = node as VideoAstNode; return new VideoAstNode(v.attributes, [...v.content, glue], v.leadingTrivia); }
        case 'unhandledBlock': { const u = node as UnhandledBlockAstNode; return new UnhandledBlockAstNode(u.tokenType, [...u.content, glue], u.leadingTrivia); }
        case 'table': { const t = node as TableAstNode; return new TableAstNode([...t.content, glue], t.leadingTrivia); }
        case 'blockQuote': { const b = node as BlockQuoteAstNode; return new BlockQuoteAstNode(_appendIntoLast(b.content, glue), b.leadingTrivia); }
        case 'list': { const l = node as ListAstNode; return new ListAstNode(l.ordered, _appendIntoLast(l.content, glue), l.leadingTrivia); }
        case 'listItem': { const it = node as ListItemAstNode; return new ListItemAstNode(it.marker, _appendIntoLast(it.content, glue), it.checked, it.leadingTrivia); }
        default: return undefined;
    }
}

/**
 * Recurses {@link _appendTrailingGlue} into the *last* child of `content` so the
 * glue sinks into the deepest trailing paragraph. Only the last child is tried —
 * the glue is the trailing-most run in source, so it must stay after any glue the
 * last child already carries; when the last child cannot host it (or there is
 * none), the glue is appended at the end, preserving source order.
 */
function _appendIntoLast<T extends AstNode>(content: readonly T[], glue: GlueAstNode): T[] {
    const last = content[content.length - 1];
    const host = last !== undefined ? _appendTrailingGlue(last, glue) : undefined;
    if (host) { const out = content.slice(); out[out.length - 1] = host as T; return out; }
    return [...content, glue as unknown as T];
}

/**
 * Guarantees the document has at least one block. A source with no blocks (the
 * empty string, or whitespace-only input that produced only leading glue)
 * becomes a single empty {@link ParagraphAstNode} hosting whatever glue was
 * present, so document content is always a run of blocks.
 */
function _ensureBlocks(content: readonly (BlockAstNode | GlueAstNode)[]): readonly (BlockAstNode | GlueAstNode)[] {
    if (content.some(n => !(n instanceof GlueAstNode))) { return content; }
    return [new ParagraphAstNode(content as readonly GlueAstNode[])];
}

/**
 * Collects a node's placed children and fills the gaps between them with
 * {@link GlueAstNode}, yielding an array that tiles `[parentStart, parentStart+len)`
 * exactly. `glueKind` tags glue that must stay hideable (table cell pipes).
 */
class Content {
    private readonly _entries: Entry[] = [];
    constructor(private readonly _parentStart: number, private readonly _source: string) { }

    add(node: AstNode, start: number): void { this._entries.push({ node, start }); }

    build<T extends AstNode = AstNode>(parentLength: number, glueKind?: string): T[] {
        this._entries.sort((a, b) => a.start - b.start);
        const out: AstNode[] = [];
        let pos = this._parentStart;
        const end = this._parentStart + parentLength;
        // Split a gap that ends in indentation (a newline followed by spaces/tabs)
        // into the line break plus a separate `indent` glue, mirroring how a
        // tokenizer attributes leading trivia to the following token. The indent
        // glue is later re-attributed onto the block it precedes (see
        // `_pullIndentIntoBlocks`), so its whitespace renders on that block's line
        // instead of trailing the previous one.
        const gap = (s: number, e: number) => {
            const text = this._source.substring(s, e);
            // Any `>` left in an unclaimed source gap is a structural
            // block-quote prefix. Inline continuation prefixes are explicit
            // markers before gap filling, while literal `>` content is emitted
            // as text, so only block-level prefixes reach this path.
            const effectiveKind = glueKind
                ?? (/(?:^|[\r\n])[ \t]*>[ \t]?/.test(text) ? 'blockQuoteSourceGap' : undefined);
            const m = effectiveKind ? null : /\n[^\S\n]+$/.exec(text);
            if (!m) { out.push(new GlueAstNode(text, effectiveKind)); return; }
            const indent = text.slice(m.index + 1);
            out.push(new GlueAstNode(text.slice(0, text.length - indent.length)));
            out.push(new GlueAstNode(indent, 'indent'));
        };
        for (const { node, start } of this._entries) {
            if (node.length === 0) { continue; }
            if (start > pos) { gap(pos, start); }
            out.push(node);
            pos = start + node.length;
        }
        if (pos < end) { gap(pos, end); }
        return out as T[];
    }
}

class AstBuilder {
    private _idx = 0;
    private _checkChecked: boolean | undefined;

    constructor(private readonly _events: MicromarkEvent[], private readonly _source: string) { }

    build(): DocumentAstNode {
        const cb = new Content(0, this._source);
        let coveredEnd = 0;
        while (this._idx < this._events.length) {
            const ev = this._events[this._idx];
            if (ev.type === 'enter') {
                const start = ev.startOffset;
                const block = this._tryParseBlock();
                if (block) { cb.add(block, start); coveredEnd = Math.max(coveredEnd, start + block.length); }
                else {
                    const unhandled = this._tryParseUnhandled(coveredEnd);
                    if (unhandled) { cb.add(unhandled.node, unhandled.start); coveredEnd = Math.max(coveredEnd, unhandled.start + unhandled.node.length); }
                }
            } else { this._idx++; }
        }
        return new DocumentAstNode(_ensureBlocks(_attachBlockGaps(_pullIndentIntoBlocks(cb.build<BlockAstNode | GlueAstNode>(this._source.length)))));
    }

    private _tryParseBlock(): BlockAstNode | undefined {
        switch (this._events[this._idx].tokenType) {
            case 'yaml': return this._parseFrontMatter();
            case 'atxHeading': return this._parseHeading();
            case 'paragraph': return this._parseParagraphOrVideo();
            case 'codeFenced': return this._parseCodeFenced();
            case 'codeIndented': return this._parseCodeIndented();
            case 'mathFlow': return this._parseMathFlow();
            case 'thematicBreak': return this._parseThematicBreak();
            case 'blockQuote': return this._parseBlockQuote();
            case 'listUnordered':
            case 'listOrdered': return this._parseList();
            case 'table': return this._parseTable();
            default:
                return undefined;
        }
    }

    private _parseHtmlFlow(): VideoAstNode | UnhandledBlockAstNode {
        const eventStartIndex = this._idx;
        const { raw, startOffset, endOffset } = this._consumeVerbatimBlock();
        const content = [new MarkerAstNode('content', raw)];
        const logicalHtml = this._logicalHtmlSource(eventStartIndex, this._idx, startOffset, endOffset);
        const classification = _classifyVideoBlock(logicalHtml);
        return classification.kind === 'supported'
            ? new VideoAstNode(classification.attributes, content)
            : new UnhandledBlockAstNode('htmlFlow', content);
    }

    /**
     * Fallback for an unrecognized top-level token (a setext heading or any
     * extension construct). Consumes the whole
     * `enter…exit` span of that token — depth-counting so a same-typed nested
     * token cannot end it early — and captures the raw source verbatim as a
     * single `content` marker, so the text is preserved and rendered as an
     * explicit "unhandled" block instead of being demoted to invisible glue.
     */
    private _parseUnhandledBlock(): UnhandledBlockAstNode {
        const { tokenType, raw } = this._consumeVerbatimBlock();
        return new UnhandledBlockAstNode(tokenType, [new MarkerAstNode('content', raw)]);
    }

    private _consumeVerbatimBlock(): {
        readonly tokenType: string;
        readonly raw: string;
        readonly startOffset: number;
        readonly endOffset: number;
    } {
        const enter = this._events[this._idx];
        const tokenType = enter.tokenType;
        this._idx++;
        let depth = 1;
        let exit = enter;
        while (this._idx < this._events.length && depth > 0) {
            const ev = this._events[this._idx];
            if (ev.tokenType === tokenType) { depth += ev.type === 'enter' ? 1 : -1; }
            if (depth === 0) { exit = ev; }
            this._idx++;
        }
        const raw = this._source.substring(enter.startOffset, exit.endOffset);
        return { tokenType, raw, startOffset: enter.startOffset, endOffset: exit.endOffset };
    }

    private _parseParagraphOrVideo(): ParagraphAstNode | VideoAstNode | UnhandledBlockAstNode {
        const paragraphStart = this._events[this._idx].startOffset;
        const candidateStart = _skipHtmlWhitespace(this._source, paragraphStart);
        if (!_startsWithVideoCandidate(this._source, candidateStart)) {
            return this._parseParagraph();
        }

        const paragraphEventIndex = this._idx;
        const { raw, startOffset, endOffset } = this._consumeVerbatimBlock();
        const logicalHtml = this._logicalHtmlSource(paragraphEventIndex, this._idx, startOffset, endOffset);
        const classification = _classifyVideoBlock(logicalHtml);
        if (classification.kind === 'notVideo') {
            this._idx = paragraphEventIndex;
            return this._parseParagraph();
        }

        const content = [new MarkerAstNode('content', raw)];
        return classification.kind === 'supported'
            ? new VideoAstNode(classification.attributes, content)
            : new UnhandledBlockAstNode('htmlFlow', content);
    }

    /**
     * Remove only Markdown container structure from a physical HTML source
     * slice. Every other character remains available to standalone/empty-body
     * validation, including inline constructs and character references.
     */
    private _logicalHtmlSource(
        startEventIndex: number,
        endEventIndex: number,
        sourceStart: number,
        sourceEnd: number,
    ): string {
        const removedRanges: OffsetRange[] = [];
        for (let index = startEventIndex; index < endEventIndex; index++) {
            const event = this._events[index];
            if (
                event.type === 'enter'
                && (event.tokenType === 'blockQuotePrefix' || event.tokenType === 'listItemIndent')
                && event.startOffset >= sourceStart
                && event.endOffset <= sourceEnd
            ) {
                removedRanges.push(new OffsetRange(event.startOffset, event.endOffset));
            }
        }

        let result = '';
        let offset = sourceStart;
        for (const range of removedRanges.sort((a, b) => a.start - b.start)) {
            if (range.start > offset) {
                result += this._source.substring(offset, range.start);
            }
            offset = Math.max(offset, range.endExclusive);
        }
        result += this._source.substring(offset, sourceEnd);
        return result;
    }

    /**
     * Decides what to do with an unrecognized `enter` token at the top of a
     * block-collecting loop (the document, a list item, a block quote), so all
     * three treat unknown constructs identically. A raw HTML token is classified
     * as a supported video or unhandled source; a token in
     * {@link _UNHANDLED_BLOCK_TOKENS} is captured verbatim. Neither may overlap
     * an already-claimed sibling (`start < coveredEnd`, e.g. a `setextHeading`
     * micromark re-claims back over a preceding `definition`). Every other token
     * — a transparent `content` wrapper, a structural prefix/indent, a line
     * ending — is stepped over so it tiles as glue. Returns the block and its
     * start, or `undefined` when the event was stepped over.
     */
    private _tryParseUnhandled(coveredEnd: number): Entry | undefined {
        const ev = this._events[this._idx];
        const start = ev.startOffset;
        if (start >= coveredEnd) {
            if (ev.tokenType === 'htmlFlow') {
                return { node: this._parseHtmlFlow(), start };
            }
            if (_UNHANDLED_BLOCK_TOKENS.has(ev.tokenType)) {
                return { node: this._parseUnhandledBlock(), start };
            }
        }
        this._idx++;
        return undefined;
    }

    private _parseHeading(): HeadingAstNode {
        const enter = this._consume('enter', 'atxHeading');
        let level: 1 | 2 | 3 | 4 | 5 | 6 = 1;
        let markerStart = enter.startOffset;
        let markerEnd = enter.startOffset;
        const inlines: Entry[] = [];

        while (this._notExit('atxHeading')) {
            const ev = this._events[this._idx];
            if (ev.type === 'enter' && ev.tokenType === 'atxHeadingSequence') {
                const seqEnter = this._consume('enter', 'atxHeadingSequence');
                const seqExit = this._consume('exit', 'atxHeadingSequence');
                if (markerEnd === enter.startOffset) {
                    level = Math.min(6, Math.max(1, seqExit.endOffset - seqEnter.startOffset)) as 1 | 2 | 3 | 4 | 5 | 6;
                    markerStart = seqEnter.startOffset;
                    markerEnd = seqExit.endOffset;
                }
            } else if (ev.type === 'enter' && ev.tokenType === 'atxHeadingText') {
                this._consume('enter', 'atxHeadingText');
                this._parseInlines(inlines, 'atxHeadingText');
                this._consume('exit', 'atxHeadingText');
            } else { this._idx++; }
        }
        const exit = this._consume('exit', 'atxHeading');
        if (markerEnd > markerStart && inlines.length > 0) { markerEnd = inlines[0].start; }

        const marker = new MarkerAstNode('headingMarker', this._source.substring(enter.startOffset, markerEnd));
        const cb = new Content(markerEnd, this._source);
        for (const e of inlines) { cb.add(e.node, e.start); }
        const content = cb.build<HeadingAstNode['content'][number]>(exit.endOffset - markerEnd);
        return new HeadingAstNode(level, marker, content);
    }

    private _parseParagraph(): ParagraphAstNode {
        const enter = this._consume('enter', 'paragraph');
        const inlines: Entry[] = [];
        while (this._notExit('paragraph')) { this._parseInlineEvent(inlines); }
        const exit = this._consume('exit', 'paragraph');
        const cb = new Content(enter.startOffset, this._source);
        for (const e of inlines) { cb.add(e.node, e.start); }
        return new ParagraphAstNode(cb.build<ParagraphAstNode['content'][number]>(exit.endOffset - enter.startOffset));
    }

    private _parseFrontMatter(): FrontMatterAstNode {
        const enter = this._consume('enter', 'yaml');
        const cb = new Content(enter.startOffset, this._source);
        let sawOpenFence = false;
        let contentStart: number | undefined;
        let contentEnd: number | undefined;

        while (this._notExit('yaml')) {
            const ev = this._events[this._idx];
            if (ev.type === 'enter' && ev.tokenType === 'yamlFence') {
                const fenceEnter = this._consume('enter', 'yamlFence');
                while (this._notExit('yamlFence')) { this._idx++; }
                const fenceExit = this._consume('exit', 'yamlFence');
                cb.add(new MarkerAstNode(
                    sawOpenFence ? 'closeFence' : 'openFence',
                    this._source.substring(fenceEnter.startOffset, fenceExit.endOffset),
                ), fenceEnter.startOffset);
                sawOpenFence = true;
            } else if (ev.tokenType === 'yamlValue' || ev.tokenType === 'lineEnding') {
                if (contentStart === undefined) { contentStart = ev.startOffset; }
                contentEnd = ev.endOffset;
                this._idx++;
            } else {
                this._idx++;
            }
        }
        const exit = this._consume('exit', 'yaml');
        if (contentStart !== undefined) {
            cb.add(new MarkerAstNode('content', this._source.substring(contentStart, contentEnd!)), contentStart);
        }
        return new FrontMatterAstNode(cb.build<MarkerAstNode | GlueAstNode>(exit.endOffset - enter.startOffset));
    }

    private _parseCodeFenced(): CodeBlockAstNode {
        const enter = this._consume('enter', 'codeFenced');
        let language = '';
        let infoStringStart: number | undefined;
        let infoStringEnd: number | undefined;
        const cb = new Content(enter.startOffset, this._source);
        let sawOpenFence = false;
        let contentStart: number | undefined;
        let contentEnd: number | undefined;

        while (this._notExit('codeFenced')) {
            const ev = this._events[this._idx];
            if (ev.type === 'enter' && ev.tokenType === 'codeFencedFence') {
                const fenceEnter = this._consume('enter', 'codeFencedFence');
                while (this._notExit('codeFencedFence')) {
                    const inner = this._events[this._idx];
                    if (
                        inner.type === 'enter'
                        && (inner.tokenType === 'codeFencedFenceInfo' || inner.tokenType === 'codeFencedFenceMeta')
                    ) {
                        const tokenType = inner.tokenType;
                        const partEnter = this._consume('enter', tokenType);
                        infoStringStart ??= partEnter.startOffset;
                        while (this._notExit(tokenType)) {
                            const ii = this._events[this._idx];
                            if (tokenType === 'codeFencedFenceInfo' && ii.type === 'enter' && ii.tokenType === 'data') {
                                language += this._source.substring(ii.startOffset, ii.endOffset);
                            }
                            this._idx++;
                        }
                        infoStringEnd = this._consume('exit', tokenType).endOffset;
                    } else { this._idx++; }
                }
                const fenceExit = this._consume('exit', 'codeFencedFence');
                cb.add(new MarkerAstNode(sawOpenFence ? 'closeFence' : 'openFence',
                    this._source.substring(fenceEnter.startOffset, fenceExit.endOffset)), fenceEnter.startOffset);
                sawOpenFence = true;
            } else if (ev.tokenType === 'codeFlowValue' || ev.tokenType === 'lineEnding') {
                if (contentStart === undefined) { contentStart = ev.startOffset; }
                contentEnd = ev.endOffset;
                this._idx++;
            } else { this._idx++; }
        }
        const exit = this._consume('exit', 'codeFenced');
        if (contentStart !== undefined) {
            cb.add(new MarkerAstNode('content', this._source.substring(contentStart, contentEnd!)), contentStart);
        }
        const infoString = infoStringStart === undefined
            ? ''
            : this._source.substring(infoStringStart, infoStringEnd);
        return new CodeBlockAstNode(language, infoString, cb.build<MarkerAstNode | GlueAstNode>(exit.endOffset - enter.startOffset));
    }

    /**
     * An indented code block has no fences and no info string: micromark strips a
     * four-space `linePrefix` from each line and emits the rest as `codeFlowValue`.
     * Each line's `linePrefix` becomes a hideable `codeIndent` marker (so the
     * structural indentation can be dropped from the rendered block, like a
     * heading's `#`), while the actual code is kept verbatim as `content` markers
     * — one run per line — so the block round-trips the source.
     */
    private _parseCodeIndented(): CodeBlockAstNode {
        const enter = this._consume('enter', 'codeIndented');
        const cb = new Content(enter.startOffset, this._source);
        let contentStart: number | undefined;
        let contentEnd: number | undefined;
        const flushContent = () => {
            if (contentStart !== undefined) {
                cb.add(new MarkerAstNode('content', this._source.substring(contentStart, contentEnd!)), contentStart);
                contentStart = undefined;
            }
        };
        while (this._notExit('codeIndented')) {
            const ev = this._events[this._idx];
            if (ev.type === 'enter' && ev.tokenType === 'linePrefix') {
                flushContent();
                const prefixEnter = this._consume('enter', 'linePrefix');
                const prefixExit = this._consume('exit', 'linePrefix');
                cb.add(new MarkerAstNode('codeIndent', this._source.substring(prefixEnter.startOffset, prefixExit.endOffset)), prefixEnter.startOffset);
            } else if (ev.tokenType === 'codeFlowValue' || ev.tokenType === 'lineEnding') {
                if (contentStart === undefined) { contentStart = ev.startOffset; }
                contentEnd = ev.endOffset;
                this._idx++;
            } else { this._idx++; }
        }
        flushContent();
        const exit = this._consume('exit', 'codeIndented');
        return new CodeBlockAstNode('', '', cb.build<MarkerAstNode | GlueAstNode>(exit.endOffset - enter.startOffset));
    }

    private _parseMathFlow(): MathBlockAstNode {
        const enter = this._consume('enter', 'mathFlow');
        const cb = new Content(enter.startOffset, this._source);
        let sawOpenFence = false;
        let contentStart: number | undefined;
        let contentEnd: number | undefined;

        while (this._notExit('mathFlow')) {
            const ev = this._events[this._idx];
            if (ev.type === 'enter' && ev.tokenType === 'mathFlowFence') {
                const fenceEnter = this._consume('enter', 'mathFlowFence');
                while (this._notExit('mathFlowFence')) { this._idx++; }
                const fenceExit = this._consume('exit', 'mathFlowFence');
                cb.add(new MarkerAstNode(sawOpenFence ? 'closeFence' : 'openFence',
                    this._source.substring(fenceEnter.startOffset, fenceExit.endOffset)), fenceEnter.startOffset);
                sawOpenFence = true;
            } else if (ev.tokenType === 'mathFlowValue' || ev.tokenType === 'lineEnding') {
                if (contentStart === undefined) { contentStart = ev.startOffset; }
                contentEnd = ev.endOffset;
                this._idx++;
            } else { this._idx++; }
        }
        const exit = this._consume('exit', 'mathFlow');
        if (contentStart !== undefined) {
            cb.add(new MarkerAstNode('content', this._source.substring(contentStart, contentEnd!)), contentStart);
        }
        return new MathBlockAstNode(cb.build<MarkerAstNode | GlueAstNode>(exit.endOffset - enter.startOffset));
    }

    private _parseThematicBreak(): ThematicBreakAstNode {
        const enter = this._consume('enter', 'thematicBreak');
        while (this._notExit('thematicBreak')) { this._idx++; }
        const exit = this._consume('exit', 'thematicBreak');
        const marker = new MarkerAstNode('content', this._source.substring(enter.startOffset, exit.endOffset));
        return new ThematicBreakAstNode([marker]);
    }

    private _parseBlockQuote(): BlockQuoteAstNode {
        const enter = this._consume('enter', 'blockQuote');
        const cb = new Content(enter.startOffset, this._source);
        let seenBlock = false;
        let trailingPrefixes: Array<{ readonly startOffset: number; readonly endOffset: number }> = [];
        let coveredEnd = enter.startOffset;
        while (this._notExit('blockQuote')) {
            const ev = this._events[this._idx];
            if (ev.type === 'enter' && ev.tokenType === 'blockQuotePrefix') {
                const pre = this._consume('enter', 'blockQuotePrefix');
                while (this._notExit('blockQuotePrefix')) { this._idx++; }
                const preExit = this._consume('exit', 'blockQuotePrefix');
                // The *leading* `>` (this level's prefix, before its first child
                // block) becomes a real `blockQuoteMarker` marker: it sits at the
                // block's start with a single, unambiguous caret position, so the
                // view can hang it in the quote's left padding gutter (adding no
                // inline width, keeping content at the same x in active/inactive)
                // and a nested quote — itself inset by the outer padding — forms a
                // column one level in.
                //
                // Continuation prefixes inside a paragraph are consumed by
                // `_parseInlineEvent` as `blockQuoteContinuationMarker` leaves,
                // so inactive rendering can elide their source width. A prefix
                // that reaches this outer loop has no following paragraph
                // content. Consecutive trailing prefixes are promoted below:
                // the view gives each marker-only source line its own zero-source
                // visual anchor, so it no longer shares the previous line's
                // trailing caret position. Prefixes before another child block
                // remain in a `blockQuoteSourceGap`, which is hidden without a
                // footprint and shown as exact source when active.
                if (!seenBlock) {
                    cb.add(new MarkerAstNode('blockQuoteMarker', this._source.substring(pre.startOffset, preExit.endOffset)), pre.startOffset);
                } else {
                    const previous = trailingPrefixes[trailingPrefixes.length - 1];
                    if (
                        previous
                        && !/^[\r\n]*$/.test(this._source.substring(previous.endOffset, pre.startOffset))
                    ) {
                        trailingPrefixes = [];
                    }
                    trailingPrefixes.push({ startOffset: pre.startOffset, endOffset: preExit.endOffset });
                }
                coveredEnd = Math.max(coveredEnd, preExit.endOffset);
            } else if (ev.type === 'enter') {
                const start = ev.startOffset;
                const block = this._tryParseBlock();
                if (block) { cb.add(block, start); seenBlock = true; trailingPrefixes = []; coveredEnd = Math.max(coveredEnd, start + block.length); }
                else {
                    const unhandled = this._tryParseUnhandled(coveredEnd);
                    if (unhandled) { cb.add(unhandled.node, unhandled.start); seenBlock = true; trailingPrefixes = []; coveredEnd = Math.max(coveredEnd, unhandled.start + unhandled.node.length); }
                }
            } else { this._idx++; }
        }
        const exit = this._consume('exit', 'blockQuote');
        const finalTrailingPrefix = trailingPrefixes[trailingPrefixes.length - 1];
        if (
            finalTrailingPrefix
            && /^[\r\n]*$/.test(this._source.substring(finalTrailingPrefix.endOffset, exit.endOffset))
        ) {
            for (const prefix of trailingPrefixes) {
                cb.add(
                    new MarkerAstNode('blockQuoteMarker', this._source.substring(prefix.startOffset, prefix.endOffset)),
                    prefix.startOffset,
                );
            }
        }
        return new BlockQuoteAstNode(_attachBlockGaps(_pullIndentIntoBlocks(cb.build<BlockQuoteAstNode['content'][number]>(exit.endOffset - enter.startOffset))));
    }

    private _parseList(): ListAstNode {
        const listType = this._events[this._idx].tokenType;
        const ordered = listType === 'listOrdered';
        const enter = this._consume('enter', listType);
        const cb = new Content(enter.startOffset, this._source);

        let itemStart: number | undefined;
        let markerStart: number | undefined;
        let markerEnd: number | undefined;
        let itemCb: Content | undefined;
        let itemChecked: boolean | undefined;
        let lastBlockEnd: number | undefined;

        const flush = () => {
            if (itemStart === undefined || markerStart === undefined || itemCb === undefined) { return; }
            const marker = new MarkerAstNode('listItemMarker', this._source.substring(markerStart, markerEnd!));
            // The task checkbox lives inside the item's first paragraph, so it
            // tiles there as Glue; only its checked state is lifted to the item.
            const itemEnd = lastBlockEnd ?? markerEnd!;
            const content = itemCb.build<ListItemAstNode['content'][number]>(itemEnd - markerEnd!);
            cb.add(new ListItemAstNode(marker, _attachBlockGaps(_pullIndentIntoBlocks(content)), itemChecked), itemStart);
        };

        while (this._notExit(listType)) {
            const inner = this._events[this._idx];
            if (inner.type === 'enter' && inner.tokenType === 'listItemPrefix') {
                flush();
                this._consume('enter', 'listItemPrefix');
                itemStart = inner.startOffset;
                markerStart = inner.startOffset;
                itemChecked = undefined;
                lastBlockEnd = undefined;
                this._checkChecked = undefined;
                while (this._notExit('listItemPrefix')) { this._idx++; }
                markerEnd = this._events[this._idx].endOffset;
                this._consume('exit', 'listItemPrefix');
                itemCb = new Content(markerEnd, this._source);
            } else if (inner.type === 'enter') {
                const start = inner.startOffset;
                const block = this._tryParseBlock();
                if (block && itemCb) {
                    itemCb.add(block, start);
                    lastBlockEnd = start + block.length;
                    if (itemChecked === undefined && this._checkChecked !== undefined) { itemChecked = this._checkChecked; }
                } else if (!block) {
                    // An unknown construct inside the item (e.g. an HTML block) is
                    // kept verbatim rather than dropped, using the same
                    // content-vs-whitespace rule as the top level. `lastBlockEnd`
                    // (else the marker end) is the item's covered offset.
                    const unhandled = this._tryParseUnhandled(lastBlockEnd ?? markerEnd ?? start);
                    if (unhandled && itemCb) {
                        itemCb.add(unhandled.node, unhandled.start);
                        lastBlockEnd = unhandled.start + unhandled.node.length;
                    }
                }
            } else { this._idx++; }
        }
        flush();
        const exit = this._consume('exit', listType);
        return new ListAstNode(ordered, _attachBlockGaps(_pullIndentIntoBlocks(cb.build<ListItemAstNode | GlueAstNode>(exit.endOffset - enter.startOffset))));
    }

    private _parseTable(): TableAstNode {
        const enter = this._consume('enter', 'table');
        const cb = new Content(enter.startOffset, this._source);
        let columnCount = 0;

        while (this._notExit('table')) {
            const ev = this._events[this._idx];
            if (ev.type === 'enter' && ev.tokenType === 'tableHead') {
                this._consume('enter', 'tableHead');
                while (this._notExit('tableHead')) {
                    const inner = this._events[this._idx];
                    if (inner.type === 'enter' && inner.tokenType === 'tableRow') {
                        const row = this._parseTableRow('tableHeader');
                        columnCount = row.cells.length;
                        cb.add(row, inner.startOffset);
                    } else if (inner.type === 'enter' && inner.tokenType === 'tableDelimiterRow') {
                        const start = inner.startOffset;
                        while (this._notExit('tableDelimiterRow')) { this._idx++; }
                        const end = this._events[this._idx].endOffset;
                        this._idx++;
                        cb.add(this._buildDelimiterRow(start, end, columnCount), start);
                    } else { this._idx++; }
                }
                this._consume('exit', 'tableHead');
            } else if (ev.type === 'enter' && ev.tokenType === 'tableBody') {
                this._consume('enter', 'tableBody');
                while (this._notExit('tableBody')) {
                    const inner = this._events[this._idx];
                    if (inner.type === 'enter' && inner.tokenType === 'tableRow') {
                        cb.add(this._parseTableRow('tableData'), inner.startOffset);
                    } else { this._idx++; }
                }
                this._consume('exit', 'tableBody');
            } else { this._idx++; }
        }
        const exit = this._consume('exit', 'table');
        return new TableAstNode(cb.build<TableRowAstNode | GlueAstNode>(exit.endOffset - enter.startOffset));
    }

    private _buildDelimiterRow(start: number, end: number, columnCount: number): TableRowAstNode {
        const raw = this._source.substring(start, end);
        const pipes: number[] = [];
        for (let i = 0; i < raw.length; i++) { if (raw[i] === '|') { pipes.push(i); } }
        const cellStartsRel: number[] = [];
        const cols = Math.max(1, columnCount);
        if (raw[0] === '|') {
            for (let i = 0; i < cols && i < pipes.length; i++) { cellStartsRel.push(pipes[i]); }
        } else {
            cellStartsRel.push(0);
            for (let i = 0; i < cols - 1 && i < pipes.length; i++) { cellStartsRel.push(pipes[i]); }
        }
        const rowCb = new Content(start, this._source);
        for (let i = 0; i < cellStartsRel.length; i++) {
            const cs = cellStartsRel[i];
            const ce = i + 1 < cellStartsRel.length ? cellStartsRel[i + 1] : raw.length;
            const cellCb = new Content(start + cs, this._source);
            const text = raw.substring(cs, ce);
            // The last cell's closing `|` is split into its own marker so the
            // view can pin it to the column's right gridline (matching the body
            // rows' closing-pipe glue); without the split the trailing pipe
            // floats right after the dashes and the last column's outline is
            // ragged. The leading `| --- ` stays a single `tableDelimiter`.
            const isLast = i === cellStartsRel.length - 1;
            if (isLast && text.length > 1 && text.endsWith('|')) {
                cellCb.add(new MarkerAstNode('tableDelimiter', text.slice(0, -1)), start + cs);
                cellCb.add(new MarkerAstNode('tableDelimiterClose', '|'), start + cs + text.length - 1);
            } else {
                cellCb.add(new MarkerAstNode('tableDelimiter', text), start + cs);
            }
            rowCb.add(new TableCellAstNode(cellCb.build<TableCellAstNode['content'][number]>(ce - cs)), start + cs);
        }
        return new TableRowAstNode(rowCb.build<TableCellAstNode | GlueAstNode>(end - start));
    }

    private _parseTableRow(cellType: 'tableHeader' | 'tableData'): TableRowAstNode {
        const enter = this._consume('enter', 'tableRow');
        const rowCb = new Content(enter.startOffset, this._source);
        while (this._notExit('tableRow')) {
            const ev = this._events[this._idx];
            if (ev.type === 'enter' && ev.tokenType === cellType) {
                const cellEnter = this._consume('enter', cellType);
                const inlines: Entry[] = [];
                while (this._notExit(cellType)) {
                    const inner = this._events[this._idx];
                    if (inner.type === 'enter' && inner.tokenType === 'tableContent') {
                        this._consume('enter', 'tableContent');
                        while (this._notExit('tableContent')) { this._parseInlineEvent(inlines); }
                        this._consume('exit', 'tableContent');
                    } else { this._idx++; }
                }
                const cellExit = this._consume('exit', cellType);
                const cellCb = new Content(cellEnter.startOffset, this._source);
                for (const e of inlines) { cellCb.add(e.node, e.start); }
                rowCb.add(new TableCellAstNode(cellCb.build<TableCellAstNode['content'][number]>(cellExit.endOffset - cellEnter.startOffset, 'tableCellGlue')), cellEnter.startOffset);
            } else { this._idx++; }
        }
        const exit = this._consume('exit', 'tableRow');
        return new TableRowAstNode(rowCb.build<TableCellAstNode | GlueAstNode>(exit.endOffset - enter.startOffset));
    }

    private _parseInlines(entries: Entry[], untilExit: string): void {
        while (this._idx < this._events.length) {
            const ev = this._events[this._idx];
            if (ev.type === 'exit' && ev.tokenType === untilExit) { return; }
            this._parseInlineEvent(entries);
        }
    }

    private _parseInlineEvent(entries: Entry[]): void {
        const ev = this._events[this._idx];
        if (ev.type === 'enter') {
            switch (ev.tokenType) {
                case 'strongSequence':
                case 'emphasisSequence': this._parseEmphasisOrStrong(entries); return;
                case 'codeText': entries.push(this._parseInlineCode()); return;
                case 'mathText': entries.push(this._parseInlineMath()); return;
                case 'link': entries.push(this._parseLink()); return;
                case 'image': entries.push(this._parseImage()); return;
                case 'strikethrough': entries.push(this._parseStrikethrough()); return;
                case 'hardBreakTrailing':
                case 'hardBreakEscape': entries.push(this._parseHardBreak()); return;
                case 'blockQuotePrefix': {
                    const { marker, lineEnding } = this._parseBlockQuoteContinuationMarker();
                    const previous = entries[entries.length - 1];
                    if (
                        lineEnding
                        && (!previous || previous.start + previous.node.length <= lineEnding.startOffset)
                    ) {
                        entries.push({
                            node: new GlueAstNode(
                                this._source.substring(lineEnding.startOffset, lineEnding.endOffset),
                                'blockQuoteLineBreak',
                            ),
                            start: lineEnding.startOffset,
                        });
                    }
                    entries.push(marker);
                    return;
                }
            }
        }
        if (ev.type === 'exit' && (ev.tokenType === 'data' || ev.tokenType === 'codeTextData')) {
            entries.push({ node: new TextAstNode(this._source.substring(ev.startOffset, ev.endOffset)), start: ev.startOffset });
        }
        if (ev.type === 'exit' && ev.tokenType === 'taskListCheckValueChecked') { this._checkChecked = true; }
        else if (ev.type === 'exit' && ev.tokenType === 'taskListCheckValueUnchecked') { this._checkChecked = false; }
        this._idx++;
    }

    private _parseBlockQuoteContinuationMarker(): {
        readonly marker: Entry;
        readonly lineEnding?: { readonly startOffset: number; readonly endOffset: number };
    } {
        let start = this._events[this._idx].startOffset;
        let indentationIndex = this._idx - 1;
        while (indentationIndex >= 0) {
            const indentation = this._events[indentationIndex];
            if (
                indentation.type !== 'exit'
                || (indentation.tokenType !== 'linePrefix' && indentation.tokenType !== 'listItemIndent')
                || indentation.endOffset !== start
            ) {
                break;
            }
            start = indentation.startOffset;
            indentationIndex--;
            const enter = this._events[indentationIndex];
            if (
                enter?.type === 'enter'
                && enter.tokenType === indentation.tokenType
                && enter.startOffset === indentation.startOffset
                && enter.endOffset === indentation.endOffset
            ) {
                indentationIndex--;
            }
        }
        const lineEndingExit = this._events[indentationIndex];
        const lineEndingEnter = this._events[indentationIndex - 1];
        const lineEndingEnd = Math.min(lineEndingExit?.endOffset ?? start, start);
        const lineEnding = lineEndingExit?.type === 'exit'
            && lineEndingExit.tokenType === 'lineEnding'
            && lineEndingEnter?.type === 'enter'
            && lineEndingEnter.tokenType === 'lineEnding'
            && lineEndingEnter.startOffset === lineEndingExit.startOffset
            && lineEndingEnter.endOffset === lineEndingExit.endOffset
            && lineEndingEnter.startOffset < lineEndingEnd
            ? { startOffset: lineEndingEnter.startOffset, endOffset: lineEndingEnd }
            : undefined;
        const enter = this._consume('enter', 'blockQuotePrefix');
        while (this._notExit('blockQuotePrefix')) { this._idx++; }
        const exit = this._consume('exit', 'blockQuotePrefix');
        return {
            marker: {
                node: new MarkerAstNode('blockQuoteContinuationMarker', this._source.substring(start, exit.endOffset)),
                start,
            },
            lineEnding,
        };
    }

    /**
     * A GFM hard line break — either two-or-more trailing spaces
     * (`hardBreakTrailing`) or a backslash (`hardBreakEscape`) — followed by the
     * line ending it forces. Both halves are absorbed into a single
     * `hardBreak` marker, so the node *is* the whole break. A bare `lineEnding`
     * normally stays glue that collapses to a space; one immediately followed
     * by an explicit block-quote continuation prefix becomes
     * `blockQuoteLineBreak` glue so GitHub-style quoted source lines stay
     * visually distinct. Hard breaks already own their ending, so the
     * continuation parser does not add a second break.
     */
    private _parseHardBreak(): Entry {
        const enter = this._events[this._idx];
        const tokenType = enter.tokenType;
        this._consume('enter', tokenType);
        while (this._notExit(tokenType)) { this._idx++; }
        let end = this._consume('exit', tokenType).endOffset;
        const next = this._events[this._idx];
        if (next && next.type === 'enter' && next.tokenType === 'lineEnding') {
            this._consume('enter', 'lineEnding');
            end = this._consume('exit', 'lineEnding').endOffset;
        }
        return { node: new MarkerAstNode('hardBreak', this._source.substring(enter.startOffset, end)), start: enter.startOffset };
    }

    private _parseEmphasisOrStrong(entries: Entry[]): void {
        const tokenType = this._events[this._idx].tokenType;
        const isStrong = tokenType === 'strongSequence';
        const openEnter = this._consume('enter', tokenType);
        const openExit = this._consume('exit', tokenType);
        const inner: Entry[] = [];

        while (this._idx < this._events.length) {
            const next = this._events[this._idx];
            if (next.type === 'enter' && next.tokenType === tokenType) {
                const closeEnter = this._consume('enter', tokenType);
                const closeExit = this._consume('exit', tokenType);
                const openMarker = new MarkerAstNode('openMarker', this._source.substring(openEnter.startOffset, openExit.endOffset));
                const closeMarker = new MarkerAstNode('closeMarker', this._source.substring(closeEnter.startOffset, closeExit.endOffset));
                const cb = new Content(openExit.endOffset, this._source);
                for (const e of inner) { cb.add(e.node, e.start); }
                const content = cb.build<StrongAstNode['content'][number]>(closeEnter.startOffset - openExit.endOffset);
                const node = isStrong
                    ? new StrongAstNode(openMarker, content, closeMarker)
                    : new EmphasisAstNode(openMarker, content, closeMarker);
                entries.push({ node, start: openEnter.startOffset });
                return;
            }
            this._parseInlineEvent(inner);
        }
        entries.push({ node: new TextAstNode(this._source.substring(openEnter.startOffset, openExit.endOffset)), start: openEnter.startOffset });
    }

    private _parseInlineCode(): Entry {
        const enter = this._consume('enter', 'codeText');
        const cb = new Content(enter.startOffset, this._source);
        let sawOpen = false;
        let contentStart: number | undefined;
        let contentEnd: number | undefined;
        while (this._notExit('codeText')) {
            const ev = this._events[this._idx];
            if (ev.type === 'enter' && ev.tokenType === 'codeTextSequence') {
                cb.add(new MarkerAstNode(sawOpen ? 'closeMarker' : 'openMarker', this._source.substring(ev.startOffset, ev.endOffset)), ev.startOffset);
                sawOpen = true;
            } else if (ev.type === 'enter' && ev.tokenType === 'codeTextData') {
                if (contentStart === undefined) { contentStart = ev.startOffset; }
                contentEnd = ev.endOffset;
            }
            this._idx++;
        }
        const exit = this._consume('exit', 'codeText');
        if (contentStart !== undefined) { cb.add(new MarkerAstNode('content', this._source.substring(contentStart, contentEnd!)), contentStart); }
        return { node: new InlineCodeAstNode(cb.build<MarkerAstNode | GlueAstNode>(exit.endOffset - enter.startOffset)), start: enter.startOffset };
    }

    private _parseInlineMath(): Entry {
        const enter = this._consume('enter', 'mathText');
        const cb = new Content(enter.startOffset, this._source);
        let sawOpen = false;
        let contentStart: number | undefined;
        let contentEnd: number | undefined;
        while (this._notExit('mathText')) {
            const ev = this._events[this._idx];
            if (ev.type === 'enter' && ev.tokenType === 'mathTextSequence') {
                cb.add(new MarkerAstNode(sawOpen ? 'closeMarker' : 'openMarker', this._source.substring(ev.startOffset, ev.endOffset)), ev.startOffset);
                sawOpen = true;
            } else if (ev.type === 'enter' && ev.tokenType === 'mathTextData') {
                if (contentStart === undefined) { contentStart = ev.startOffset; }
                contentEnd = ev.endOffset;
            }
            this._idx++;
        }
        const exit = this._consume('exit', 'mathText');
        if (contentStart !== undefined) { cb.add(new MarkerAstNode('content', this._source.substring(contentStart, contentEnd!)), contentStart); }
        return { node: new InlineMathAstNode(cb.build<MarkerAstNode | GlueAstNode>(exit.endOffset - enter.startOffset)), start: enter.startOffset };
    }

    private _parseStrikethrough(): Entry {
        const enter = this._consume('enter', 'strikethrough');
        let openMarker: MarkerAstNode | undefined;
        let closeMarker: MarkerAstNode | undefined;
        let contentStart = enter.startOffset;
        let contentEnd = enter.startOffset;
        const inner: Entry[] = [];
        while (this._notExit('strikethrough')) {
            const ev = this._events[this._idx];
            if (ev.type === 'enter' && ev.tokenType === 'strikethroughSequence') {
                const text = this._source.substring(ev.startOffset, ev.endOffset);
                if (!openMarker) { openMarker = new MarkerAstNode('openMarker', text); contentStart = ev.endOffset; }
                else { closeMarker = new MarkerAstNode('closeMarker', text); contentEnd = ev.startOffset; }
                this._idx++;
            } else if (ev.type === 'enter' && ev.tokenType === 'strikethroughText') {
                this._consume('enter', 'strikethroughText');
                this._parseInlines(inner, 'strikethroughText');
                this._consume('exit', 'strikethroughText');
            } else { this._idx++; }
        }
        this._consume('exit', 'strikethrough');
        const cb = new Content(contentStart, this._source);
        for (const e of inner) { cb.add(e.node, e.start); }
        const content = cb.build<StrikethroughAstNode['content'][number]>(contentEnd - contentStart);
        return { node: new StrikethroughAstNode(openMarker!, content, closeMarker!), start: enter.startOffset };
    }

    private _parseLink(): Entry {
        const enter = this._consume('enter', 'link');
        const cb = new Content(enter.startOffset, this._source);
        const inner: Entry[] = [];
        let url = '';
        let sawOpenBracket = false;

        while (this._notExit('link')) {
            const ev = this._events[this._idx];
            if (ev.type === 'enter' && ev.tokenType === 'label') {
                this._consume('enter', 'label');
                while (this._notExit('label')) {
                    const i2 = this._events[this._idx];
                    if (i2.type === 'enter' && i2.tokenType === 'labelMarker') {
                        cb.add(new MarkerAstNode(sawOpenBracket ? 'closeBracket' : 'openBracket', this._source.substring(i2.startOffset, i2.endOffset)), i2.startOffset);
                        sawOpenBracket = true;
                    } else if (i2.type === 'enter' && i2.tokenType === 'labelText') {
                        this._consume('enter', 'labelText');
                        this._parseInlines(inner, 'labelText');
                        this._consume('exit', 'labelText');
                        continue;
                    }
                    this._idx++;
                }
                this._consume('exit', 'label');
            } else if (ev.type === 'enter' && ev.tokenType === 'resource') {
                this._consume('enter', 'resource');
                let sawOpenParen = false;
                while (this._notExit('resource')) {
                    const i2 = this._events[this._idx];
                    if (i2.type === 'enter' && i2.tokenType === 'resourceMarker') {
                        cb.add(new MarkerAstNode(sawOpenParen ? 'closeParen' : 'openParen', this._source.substring(i2.startOffset, i2.endOffset)), i2.startOffset);
                        sawOpenParen = true;
                    } else if (i2.type === 'enter' && i2.tokenType === 'resourceDestinationString') {
                        url = this._source.substring(i2.startOffset, i2.endOffset);
                        cb.add(new MarkerAstNode('url', url), i2.startOffset);
                    }
                    this._idx++;
                }
                this._consume('exit', 'resource');
            } else if (ev.type === 'enter' && ev.tokenType === 'reference') {
                this._consume('enter', 'reference');
                let sawOpenBracket = false;
                while (this._notExit('reference')) {
                    const i2 = this._events[this._idx];
                    if (i2.type === 'enter' && i2.tokenType === 'referenceMarker') {
                        cb.add(new MarkerAstNode(sawOpenBracket ? 'referenceCloseBracket' : 'referenceOpenBracket', this._source.substring(i2.startOffset, i2.endOffset)), i2.startOffset);
                        sawOpenBracket = true;
                    } else if (i2.type === 'enter' && i2.tokenType === 'referenceString') {
                        cb.add(new MarkerAstNode('reference', this._source.substring(i2.startOffset, i2.endOffset)), i2.startOffset);
                    }
                    this._idx++;
                }
                this._consume('exit', 'reference');
            } else { this._idx++; }
        }
        const exit = this._consume('exit', 'link');
        for (const e of inner) { cb.add(e.node, e.start); }
        return { node: new LinkAstNode(url, cb.build<LinkAstNode['content'][number]>(exit.endOffset - enter.startOffset)), start: enter.startOffset };
    }

    private _parseImage(): Entry {
        const enter = this._consume('enter', 'image');
        const cb = new Content(enter.startOffset, this._source);
        let alt = '';
        let url = '';
        let sawOpenBracket = false;

        while (this._notExit('image')) {
            const ev = this._events[this._idx];
            if (ev.type === 'enter' && ev.tokenType === 'label') {
                this._consume('enter', 'label');
                while (this._notExit('label')) {
                    const i2 = this._events[this._idx];
                    if (i2.type === 'enter' && i2.tokenType === 'labelImageMarker') {
                        cb.add(new MarkerAstNode('bangBracket', this._source.substring(i2.startOffset, i2.endOffset)), i2.startOffset);
                    } else if (i2.type === 'enter' && i2.tokenType === 'labelMarker') {
                        cb.add(new MarkerAstNode(sawOpenBracket ? 'closeBracket' : 'openBracket', this._source.substring(i2.startOffset, i2.endOffset)), i2.startOffset);
                        sawOpenBracket = true;
                    } else if (i2.type === 'enter' && i2.tokenType === 'labelText') {
                        alt = this._source.substring(i2.startOffset, i2.endOffset);
                    }
                    this._idx++;
                }
                this._consume('exit', 'label');
            } else if (ev.type === 'enter' && ev.tokenType === 'resource') {
                this._consume('enter', 'resource');
                let sawOpenParen = false;
                while (this._notExit('resource')) {
                    const i2 = this._events[this._idx];
                    if (i2.type === 'enter' && i2.tokenType === 'resourceMarker') {
                        cb.add(new MarkerAstNode(sawOpenParen ? 'closeParen' : 'openParen', this._source.substring(i2.startOffset, i2.endOffset)), i2.startOffset);
                        sawOpenParen = true;
                    } else if (i2.type === 'enter' && i2.tokenType === 'resourceDestinationString') {
                        url = this._source.substring(i2.startOffset, i2.endOffset);
                    }
                    this._idx++;
                }
                this._consume('exit', 'resource');
            } else { this._idx++; }
        }
        const exit = this._consume('exit', 'image');
        return { node: new ImageAstNode(alt, url, cb.build<MarkerAstNode | GlueAstNode>(exit.endOffset - enter.startOffset)), start: enter.startOffset };
    }

    private _notExit(tokenType: string): boolean {
        if (this._idx >= this._events.length) { return false; }
        const ev = this._events[this._idx];
        return !(ev.type === 'exit' && ev.tokenType === tokenType);
    }

    private _consume(type: 'enter' | 'exit', tokenType: string): MicromarkEvent {
        const ev = this._events[this._idx];
        if (!ev || ev.type !== type || ev.tokenType !== tokenType) {
            throw new Error(`Expected ${type}:${tokenType} at ${this._idx}, got ${ev?.type}:${ev?.tokenType}`);
        }
        this._idx++;
        return ev;
    }
}
