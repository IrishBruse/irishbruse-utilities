/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { EditorModel, EditorView, ViewNode, type Selection } from '@vscode/markdown-editor';
import { Disposable } from './disposable';
import { observeAll } from './observeAll';

/** Spaces / tabs that sit at the end of a source line (Markdown trailing whitespace). */
export const EOL_WS_CLASS = 'ib-md-eol-ws';
export const EOL_DOTS_ATTR = 'data-ib-eol-dots';
/** Leading / other whitespace that is covered by the current selection. */
export const SEL_WS_CLASS = 'ib-md-sel-ws';
export const SEL_DOTS_ATTR = 'data-ib-sel-dots';
const GLUE_WS_OVERLAY_CLASS = 'ib-md-glue-ws-overlay';
/**
 * A list inside a blockquote stores the next line's `>` as source-gap glue
 * on the previous item. This class pulls a single continuation into the gutter.
 */
export const QUOTE_NEXT_LINE_CLASS = 'ib-md-quote-next-line';

/** One source line of quote prefixes, such as `\n> `, `\n> > `, or `\n   > `. */
const QUOTE_CONTINUATION_GAP = /^\r?\n[ \t]*(?:>[ \t]*)+$/;

const ELEMENT_NODE = 1;
const TEXT_NODE = 3;
const COMMENT_NODE = 8;

const LINE_END_CLASSES = new Set([
	'md-ws-newline',
	'md-ws-newline-glyph',
	'md-ws-blockbreak-glyph',
	'md-hardbreak',
	'ib-md-virtual-spacer',
	'md-cursor',
	'md-selection',
]);

const STRUCTURAL_GLUE_CLASSES = [
	'md-glue-indent',
	'md-glue-blockGap',
	'md-glue-blockBreak',
	'md-glue-tableCellGlue',
] as const;

export interface WhitespaceWalkNode {
	readonly nodeType: number;
	readonly textContent: string | null;
	readonly nextSibling: WhitespaceWalkNode | null;
	readonly parentNode?: WhitespaceWalkNode | null;
	readonly firstChild?: WhitespaceWalkNode | null;
	readonly tagName?: string;
	readonly classList?: { contains(name: string): boolean };
}

function hasClass(el: WhitespaceWalkNode, name: string): boolean {
	return el.classList?.contains(name) ?? false;
}

function isWhitespaceSpan(el: WhitespaceWalkNode): boolean {
	if (el.nodeType !== ELEMENT_NODE) {
		return false;
	}
	const text = el.textContent ?? '';
	if (hasClass(el, 'md-ws-space')) {
		return text === ' ' || text === '\u00a0';
	}
	if (hasClass(el, 'md-ws-tab')) {
		return text === '\t';
	}
	return false;
}

function isStructuralGlue(el: WhitespaceWalkNode): boolean {
	return STRUCTURAL_GLUE_CLASSES.some(name => hasClass(el, name));
}

/** Trailing-space glue at the end of a paragraph (`glueKind` is unset). */
export function isTrailingSpaceGlue(el: WhitespaceWalkNode): boolean {
	if (el.nodeType !== ELEMENT_NODE || !hasClass(el, 'md-glue') || isStructuralGlue(el)) {
		return false;
	}
	return /^[ \t]+$/.test(el.textContent ?? '');
}

function isLineEnd(el: WhitespaceWalkNode): boolean {
	if (el.nodeType !== ELEMENT_NODE) {
		return false;
	}
	if (el.tagName === 'BR') {
		return true;
	}
	for (const name of LINE_END_CLASSES) {
		if (hasClass(el, name)) {
			return true;
		}
	}
	return false;
}

function isIgnorable(node: WhitespaceWalkNode): boolean {
	if (node.nodeType === COMMENT_NODE) {
		return true;
	}
	if (node.nodeType === TEXT_NODE) {
		const value = node.textContent ?? '';
		return value.length === 0 || value === '\u200b';
	}
	return false;
}

function nearestBlock(el: WhitespaceWalkNode): WhitespaceWalkNode | null {
	let node = el.parentNode ?? null;
	while (node) {
		if (hasClass(node, 'md-block')) {
			return node;
		}
		node = node.parentNode ?? null;
	}
	return null;
}

/**
 * Next node after `node` in document order, skipping the subtree of `node`.
 * Stops at `root` so caret overlays and the next block are not treated as
 * following content.
 */
function nextAfter(node: WhitespaceWalkNode, root: WhitespaceWalkNode | null): WhitespaceWalkNode | null {
	if (node.nextSibling) {
		return node.nextSibling;
	}
	let parent = node.parentNode ?? null;
	while (parent && parent !== root) {
		if (parent.nextSibling) {
			return parent.nextSibling;
		}
		parent = parent.parentNode ?? null;
	}
	return null;
}

function isFollowedOnlyByLineEnd(el: WhitespaceWalkNode): boolean {
	const root = nearestBlock(el);
	let node = nextAfter(el, root);
	while (node) {
		if (isIgnorable(node)) {
			node = nextAfter(node, root);
			continue;
		}
		if (node.nodeType === TEXT_NODE) {
			const value = node.textContent ?? '';
			if (/[\n\r]/.test(value)) {
				return true;
			}
			if (/^\s+$/.test(value)) {
				node = nextAfter(node, root);
				continue;
			}
			return false;
		}
		if (node.nodeType === ELEMENT_NODE) {
			if (hasClass(node, 'md-block')) {
				return true;
			}
			if (isLineEnd(node) || isTrailingSpaceGlue(node)) {
				return true;
			}
			if (isWhitespaceSpan(node)) {
				node = nextAfter(node, root);
				continue;
			}
			if (node.firstChild) {
				node = node.firstChild;
				continue;
			}
			node = nextAfter(node, root);
			continue;
		}
		node = nextAfter(node, root);
	}
	return true;
}

/**
 * True when this space/tab is only followed by more trailing whitespace
 * or a line break. Indent glue (spaces in their own parent before content)
 * is not trailing.
 */
export function isEolWhitespaceSpan(el: WhitespaceWalkNode): boolean {
	if (!isWhitespaceSpan(el) && !isTrailingSpaceGlue(el)) {
		return false;
	}
	return isFollowedOnlyByLineEnd(el);
}

/** True when glue text is a single blockquote continuation, not a blank quote line. */
export function isQuoteContinuationGap(text: string): boolean {
	return QUOTE_CONTINUATION_GAP.test(text);
}

function isQuotePrefixWhitespace(node: HTMLElement): boolean {
	return node.closest(`.${QUOTE_NEXT_LINE_CLASS}`) !== null;
}

/**
 * Mark source-gap glue that is only the next line's quote prefix so CSS can
 * hang it in the gutter. Blank lines (`\n>\n> `) stay on the library path.
 */
export function markQuoteContinuationGaps(root: ParentNode): void {
	for (const node of root.querySelectorAll('.md-glue-blockQuoteSourceGap')) {
		if (!(node instanceof HTMLElement)) {
			continue;
		}
		node.classList.toggle(QUOTE_NEXT_LINE_CLASS, isQuoteContinuationGap(node.textContent ?? ''));
	}
}

/** True when `[start, start + length)` overlaps a non-empty selection. */
export function selectionCoversRange(
	selectionStart: number,
	selectionEndExclusive: number,
	start: number,
	length: number,
): boolean {
	if (selectionEndExclusive <= selectionStart || length <= 0) {
		return false;
	}
	return start < selectionEndExclusive && start + length > selectionStart;
}

function glueDotCount(text: string): number {
	let count = 0;
	for (const ch of text) {
		if (ch === ' ' || ch === '\t' || ch === '\u00a0') {
			count++;
		}
	}
	return count;
}

/** Space-only glue overlay string; `null` when tabs need per-character `>|` marks. */
export function glueWhitespaceDots(text: string): string | null {
	if (text.includes('\t')) {
		return null;
	}
	const count = glueDotCount(text);
	return count > 0 ? '·'.repeat(count) : '';
}

function clearGlueWhitespaceOverlays(glue: HTMLElement, mode?: 'eol' | 'sel'): void {
	for (const node of glue.querySelectorAll(`.${GLUE_WS_OVERLAY_CLASS}`)) {
		if (!(node instanceof HTMLElement)) {
			continue;
		}
		if (!mode || node.classList.contains(mode === 'eol' ? 'ib-md-glue-ws-eol' : 'ib-md-glue-ws-sel')) {
			node.remove();
		}
	}
}

function isListItemIndentGlue(glue: HTMLElement): boolean {
	return glue.classList.contains('md-glue-indent') && glue.closest('.md-list-item-active') !== null;
}

function paintGlueWhitespaceOverlays(glue: HTMLElement, text: string, mode: 'eol' | 'sel'): void {
	clearGlueWhitespaceOverlays(glue, mode);
	const modeClass = mode === 'eol' ? 'ib-md-glue-ws-eol' : 'ib-md-glue-ws-sel';
	const tabGlyph = isListItemIndentGlue(glue);
	for (let i = 0; i < text.length; i++) {
		const ch = text[i];
		if (ch !== ' ' && ch !== '\t' && ch !== '\u00a0') {
			continue;
		}
		const overlay = document.createElement('span');
		overlay.className = `${GLUE_WS_OVERLAY_CLASS} ${modeClass}`;
		overlay.setAttribute('aria-hidden', 'true');
		overlay.dataset.ibGlueWs = tabGlyph || ch === '\t' ? 'tab' : 'space';
		overlay.style.left = `${i}ch`;
		glue.appendChild(overlay);
	}
}

function applyGlueWhitespaceDisplay(glue: HTMLElement, text: string, mode: 'eol' | 'sel'): void {
	const attr = mode === 'eol' ? EOL_DOTS_ATTR : SEL_DOTS_ATTR;
	clearGlueWhitespaceOverlays(glue, mode);
	if (isListItemIndentGlue(glue)) {
		glue.removeAttribute(attr);
		paintGlueWhitespaceOverlays(glue, text, mode);
		return;
	}
	const dots = glueWhitespaceDots(text);
	if (dots === null) {
		glue.removeAttribute(attr);
		paintGlueWhitespaceOverlays(glue, text, mode);
		return;
	}
	if (dots.length > 0) {
		glue.setAttribute(attr, dots);
	} else {
		glue.removeAttribute(attr);
	}
}

function hardBreakDotCount(hardBreak: HTMLElement): number {
	const src = hardBreak.querySelector('.md-hardbreak-src');
	const text = src?.textContent ?? hardBreak.textContent ?? '';
	let count = 0;
	for (const ch of text) {
		if (ch === '\n' || ch === '\r') {
			break;
		}
		if (ch === ' ' || ch === '\t' || ch === '\u00a0') {
			count++;
		}
	}
	return count;
}

/** Visible stand-in for a hard-break newline. Same length as the source character. */
export const NEWLINE_INDICATOR = '↵';

export function withNewlineIndicator(text: string): string {
	return text.replace(/[\n\r]/g, NEWLINE_INDICATOR);
}

/**
 * The last newline in visible block-break glue is mapped but not given a glyph by
 * the library. Paint it as `↵` without changing the mapped length.
 */
export function showParagraphEndNewlines(root: ParentNode): void {
	for (const glue of root.querySelectorAll('.md-glue-blockBreak:not(.md-glue-hidden)')) {
		if (!(glue instanceof HTMLElement)) {
			continue;
		}
		for (const node of glue.querySelectorAll('.md-ws-newline')) {
			paintNewlineIndicator(node.firstChild);
		}
		// The mapped paragraph-ending newline is often a bare text node after the break glyph.
		paintNewlineIndicator(glue.lastChild);
	}
}

/**
 * Newlines after a code fence are real source lines.
 * The library paints every newline but the last as a `↵` and leaves the last as a raw `\n`.
 * Paint that last one too, still length 1, so each newline can take its own line.
 */
export function showCodeBlockGapNewlines(root: ParentNode): void {
	for (const glue of root.querySelectorAll('.md-code-block .md-glue-blockGap:not(.md-glue-hidden)')) {
		if (!(glue instanceof HTMLElement)) {
			continue;
		}
		for (const node of glue.childNodes) {
			if (node instanceof Text) {
				paintNewlineIndicator(node);
			}
		}
	}
}

function paintNewlineIndicator(text: ChildNode | null | undefined): void {
	if (!(text instanceof Text) || !/[\n\r]/.test(text.data)) {
		return;
	}
	const next = withNewlineIndicator(text.data);
	if (next !== text.data) {
		text.data = next;
	}
}

function markHardBreak(el: HTMLElement, keep: Set<HTMLElement>): void {
	const count = hardBreakDotCount(el);
	if (count <= 0) {
		return;
	}
	el.classList.add(EOL_WS_CLASS);
	keep.add(el);
	const src = el.querySelector('.md-hardbreak-src');
	const hidden = src instanceof HTMLElement && src.classList.contains('md-hardbreak-src-hidden');
	if (hidden) {
		el.setAttribute(EOL_DOTS_ATTR, '·'.repeat(count));
	} else {
		el.removeAttribute(EOL_DOTS_ATTR);
	}
}

function firstMappedNode(el: HTMLElement): globalThis.Node {
	return el.firstChild instanceof Text ? el.firstChild : el;
}

function whitespaceSourceRange(el: HTMLElement, documentView: ViewNode): { start: number; length: number } | undefined {
	const mapped = firstMappedNode(el);
	const start = documentView.resolveSource({ node: mapped, offset: 0 });
	if (start === undefined) {
		return undefined;
	}
	if (mapped instanceof Text) {
		const end = documentView.resolveSource({ node: mapped, offset: mapped.data.length });
		if (end !== undefined && end > start) {
			return { start, length: end - start };
		}
	}
	const leaf = ViewNode.forDom(mapped);
	return { start, length: Math.max(1, leaf?.sourceLength ?? 1) };
}

function markSelectedWhitespace(
	root: ParentNode,
	documentView: ViewNode | undefined,
	selection: Selection | undefined,
): void {
	const keep = new Set<HTMLElement>();
	const range = selection && !selection.isCollapsed ? selection.range : undefined;
	if (documentView && range) {
		for (const node of root.querySelectorAll('.md-ws-space, .md-ws-tab')) {
			if (!(node instanceof HTMLElement) || node.classList.contains(EOL_WS_CLASS) || isQuotePrefixWhitespace(node)) {
				continue;
			}
			const span = whitespaceSourceRange(node, documentView);
			if (!span || !selectionCoversRange(range.start, range.endExclusive, span.start, span.length)) {
				continue;
			}
			node.classList.add(SEL_WS_CLASS);
			keep.add(node);
		}
		for (const node of root.querySelectorAll('.md-glue-indent')) {
			if (!(node instanceof HTMLElement) || node.querySelector('.md-ws-space, .md-ws-tab')) {
				continue;
			}
			const span = whitespaceSourceRange(node, documentView);
			if (!span || !selectionCoversRange(range.start, range.endExclusive, span.start, span.length)) {
				continue;
			}
			node.classList.add(SEL_WS_CLASS);
			applyGlueWhitespaceDisplay(node, node.textContent ?? '', 'sel');
			keep.add(node);
		}
	}
	for (const node of root.querySelectorAll(`.${SEL_WS_CLASS}`)) {
		if (node instanceof HTMLElement && !keep.has(node)) {
			node.classList.remove(SEL_WS_CLASS);
			node.removeAttribute(SEL_DOTS_ATTR);
			clearGlueWhitespaceOverlays(node, 'sel');
		}
	}
}

export function markEolWhitespace(root: ParentNode): void {
	const keep = new Set<HTMLElement>();
	for (const node of root.querySelectorAll('.md-ws-space, .md-ws-tab')) {
		if (!(node instanceof HTMLElement) || isQuotePrefixWhitespace(node)) {
			continue;
		}
		if (isEolWhitespaceSpan(node)) {
			node.classList.add(EOL_WS_CLASS);
			keep.add(node);
		}
	}
	for (const node of root.querySelectorAll('.md-glue')) {
		if (!(node instanceof HTMLElement) || !isEolWhitespaceSpan(node)) {
			continue;
		}
		node.classList.add(EOL_WS_CLASS);
		if (!node.querySelector('.md-ws-space, .md-ws-tab')) {
			applyGlueWhitespaceDisplay(node, node.textContent ?? '', 'eol');
		} else {
			node.removeAttribute(EOL_DOTS_ATTR);
			clearGlueWhitespaceOverlays(node, 'eol');
		}
		keep.add(node);
	}
	for (const node of root.querySelectorAll('.md-hardbreak')) {
		if (node instanceof HTMLElement) {
			markHardBreak(node, keep);
		}
	}
	for (const node of root.querySelectorAll(`.${EOL_WS_CLASS}`)) {
		if (node instanceof HTMLElement && !keep.has(node)) {
			node.classList.remove(EOL_WS_CLASS);
			node.removeAttribute(EOL_DOTS_ATTR);
			clearGlueWhitespaceOverlays(node, 'eol');
		}
	}
}

export function paintEditorWhitespace(
	root: ParentNode,
	documentView: ViewNode | undefined,
	selection: Selection | undefined,
): void {
	markQuoteContinuationGaps(root);
	markEolWhitespace(root);
	showParagraphEndNewlines(root);
	showCodeBlockGapNewlines(root);
	markSelectedWhitespace(root, documentView, selection);
}

/**
 * Paint trailing spaces always, and other whitespace while it is selected
 * (the VS Code default `editor.renderWhitespace: selection` behaviour).
 * Glue rebuilds overwrite `className` and drop our mark, so paint again on
 * DOM mutations and on the next frame after layout.
 */
export class EolWhitespaceController extends Disposable {
	constructor(model: EditorModel, view: EditorView) {
		super();
		let paintRaf = 0;
		let observer: MutationObserver | undefined;
		const paint = (): void => {
			paintRaf = 0;
			observer?.disconnect();
			paintEditorWhitespace(view.element, view.documentViewNode.get(), model.selection.get());
			observer?.observe(view.element, {
				subtree: true,
				childList: true,
				characterData: true,
				attributes: true,
				attributeFilter: ['class'],
			});
		};
		const schedule = (): void => {
			if (paintRaf) {
				return;
			}
			paintRaf = requestAnimationFrame(paint);
		};
		observeAll(
			this._store,
			schedule,
			view.measuredLayout.measurements,
			view.documentViewNode,
			model.selection,
		);
		observer = new MutationObserver(schedule);
		observer.observe(view.element, {
			subtree: true,
			childList: true,
			characterData: true,
			attributes: true,
			attributeFilter: ['class'],
		});
		this._register({
			dispose: () => {
				observer?.disconnect();
				if (paintRaf) {
					cancelAnimationFrame(paintRaf);
				}
			},
		});
		schedule();
	}
}
