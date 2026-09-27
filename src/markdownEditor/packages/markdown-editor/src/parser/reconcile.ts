/**
 * Incremental reconciliation: build the fresh tree normally, then walk it
 * bottom-up against the previous tree, substituting previous instances where
 * the content is provably unchanged, and carrying over stable ids where a
 * node's identity survived an edit.
 *
 * Two soundness rules drive the whole thing:
 *  - Full reuse of a node requires that its span maps to a *clean* (untouched)
 *    original range, and that the rebuilt node is `structurallyEqual` to the
 *    old one at that range. Because children are reconciled first, that
 *    structural check is by identity and stays linear.
 *  - Id carry-over uses the node's *start* offset (which, for a node that
 *    merely contains an edit, lies before the edit and maps back cleanly), so
 *    a node edited in place gets a new instance but keeps its old id.
 */

import { OffsetRange } from '../core/offsetRange.js';
import { StringEdit, StringReplacement } from '../core/stringEdit.js';
import { CodeBlockAstNode, DocumentAstNode, AstNode } from './ast.js';
import { parse } from './parse.js';

/** Maps offsets/ranges from modified (new) coordinates back to original (previous). */
export class EditMapper {
    constructor(private readonly _edit: StringEdit) { }

    /**
     * The original range corresponding to `mod`, or `undefined` if `mod`
     * overlaps any replaced/inserted text (i.e. is not provably unchanged).
     */
    getOriginalRange(mod: OffsetRange): OffsetRange | undefined {
        let delta = 0;
        for (const r of this._edit.replacements) {
            const modStart = r.replaceRange.start + delta;
            if (modStart >= mod.endExclusive) { break; }
            const dirtyEnd = modStart + r.newText.length;
            if (Math.max(modStart, mod.start) < Math.min(dirtyEnd, mod.endExclusive)) {
                return undefined;
            }
            delta += r.newText.length - r.replaceRange.length;
        }
        return mod.delta(-delta);
    }

    /** The original offset for `mod`, or `undefined` if it falls inside inserted text. */
    getOriginalOffset(mod: number): number | undefined {
        let delta = 0;
        for (const r of this._edit.replacements) {
            const modStart = r.replaceRange.start + delta;
            if (mod < modStart) { break; }
            if (mod < modStart + r.newText.length) { return undefined; }
            delta += r.newText.length - r.replaceRange.length;
        }
        return mod - delta;
    }
}

/** Indexes the previous tree for O(1) lookup by exact range or by stable id. */
export class OldTreeIndex {
    private readonly _byRange = new Map<string, AstNode[]>();
    private readonly _byId = new Map<string, AstNode>();

    constructor(root: AstNode) { this._walk(root, 0); }

    private _walk(n: AstNode, start: number): void {
        const key = `${start}:${start + n.length}`;
        let arr = this._byRange.get(key);
        if (!arr) { arr = []; this._byRange.set(key, arr); }
        arr.push(n);
        this._byId.set(`${start}:${n.kind}`, n);
        let pos = start;
        for (const c of n.children) { this._walk(c, pos); pos += c.length; }
    }

    /** The old node spanning exactly `range` with the given `kind`, if any. */
    lookupExact(range: OffsetRange, kind: string): AstNode | undefined {
        return this._byRange.get(`${range.start}:${range.endExclusive}`)?.find(n => n.kind === kind);
    }

    /** The old node that began at `originalStart` with the given `kind`. */
    lookupId(originalStart: number, kind: string): AstNode | undefined {
        return this._byId.get(`${originalStart}:${kind}`);
    }
}

function _reconcile(fresh: AstNode, start: number, mapper: EditMapper, index: OldTreeIndex, edit: StringEdit): AstNode {
    // 1. Reconcile children first, substituting reused instances upward.
    let map: Map<AstNode, AstNode> | undefined;
    let pos = start;
    for (const c of fresh.children) {
        const rc = _reconcile(c, pos, mapper, index, edit);
        if (rc !== c) { (map ??= new Map()).set(c, rc); }
        pos += c.length;
    }
    let n = map ? fresh.mapChildren(map) : fresh;

    // 2. Full reuse: clean original range + structurally identical old node.
    const orig = mapper.getOriginalRange(OffsetRange.ofStartAndLength(start, fresh.length));
    if (orig) {
        const cand = index.lookupExact(orig, n.kind);
        if (cand && n.equalsShallow(cand)) { return cand; }
    }

    // 3. Id carry-over: a changed node whose start maps cleanly to an old node
    // of the same kind keeps that old node's id (new instance, same identity).
    const os = mapper.getOriginalOffset(start);
    const old = os !== undefined ? index.lookupId(os, n.kind) : undefined;
    if (old && old.id !== n.id) { n = n.cloneWithId(old.id); }

    // 4. Code-block content link: when only the content changed, attach a
    // content-coordinate diff to the old block so the view can update in place.
    if (n instanceof CodeBlockAstNode && old instanceof CodeBlockAstNode && os !== undefined) {
        const linked = _linkCodeBlock(n, old, os, edit);
        if (linked) { return linked; }
    }

    return n;
}

/**
 * If `edit` lies entirely within `old`'s content and the fences/info string are
 * unchanged, returns `fresh` carrying a content-coordinate diff to `old`;
 * otherwise `undefined`.
 */
function _linkCodeBlock(fresh: CodeBlockAstNode, old: CodeBlockAstNode, oldStart: number, edit: StringEdit): CodeBlockAstNode | undefined {
    const oldCode = old.code;
    const freshCode = fresh.code;
    if (!oldCode || !freshCode) { return undefined; }
    if (fresh.infoString !== old.infoString) { return undefined; }
    if (fresh.openFence?.content !== old.openFence?.content) { return undefined; }
    if (fresh.closeFence?.content !== old.closeFence?.content) { return undefined; }

    const contentStart = oldStart + old.codeOffset;
    const contentEnd = contentStart + oldCode.length;
    if (!_editWithin(edit, contentStart, contentEnd)) { return undefined; }

    const contentEdit = _shiftEdit(edit, -contentStart);
    if (contentEdit.apply(oldCode.content) !== freshCode.content) { return undefined; }

    return fresh.withCodeDiff(old, contentEdit);
}

/** Whether every replacement of `edit` lies within `[start, endExclusive)`. */
function _editWithin(edit: StringEdit, start: number, endExclusive: number): boolean {
    for (const r of edit.replacements) {
        if (r.replaceRange.start < start || r.replaceRange.endExclusive > endExclusive) { return false; }
    }
    return true;
}

/** `edit` with every replacement range shifted by `delta`. */
function _shiftEdit(edit: StringEdit, delta: number): StringEdit {
    return new StringEdit(edit.replacements.map(r =>
        StringReplacement.replace(r.replaceRange.delta(delta), r.newText)));
}

export function reconcile(fresh: AstNode, previous: AstNode, edit: StringEdit): AstNode {
    return _reconcile(fresh, 0, new EditMapper(edit), new OldTreeIndex(previous), edit);
}

/**
 * Parses `text`; when `previous` and `edit` are given, reconciles the fresh
 * tree against `previous` so unchanged subtrees keep their old instances and
 * edited id-bearing nodes keep their old ids.
 */
export function parseIncremental(text: string, previous?: DocumentAstNode, edit?: StringEdit): DocumentAstNode {
    const fresh = parse(text);
    if (!previous || !edit) {
        return fresh;
    }
    return reconcile(fresh, previous, edit) as DocumentAstNode;
}
