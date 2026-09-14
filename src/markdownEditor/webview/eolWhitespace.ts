/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { EditorView } from '@vscode/markdown-editor';
import { Disposable } from './disposable';
import { observeAll } from './react';

/** Spaces / tabs that sit at the end of a source line (Markdown trailing whitespace). */
export const EOL_WS_CLASS = 'ib-md-eol-ws';
export const EOL_DOTS_ATTR = 'data-ib-eol-dots';

const ELEMENT_NODE = 1;
const TEXT_NODE = 3;
const COMMENT_NODE = 8;

const LINE_END_CLASSES = new Set([
	'md-ws-newline',
	'md-ws-newline-glyph',
	'md-ws-blockbreak-glyph',
	'md-hardbreak',
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

function glueDotCount(el: HTMLElement): number {
	const text = el.textContent ?? '';
	let count = 0;
	for (const ch of text) {
		if (ch === ' ' || ch === '\t' || ch === '\u00a0') {
			count++;
		}
	}
	return count;
}

export function markEolWhitespace(root: ParentNode): void {
	const keep = new Set<HTMLElement>();
	for (const node of root.querySelectorAll('.md-ws-space, .md-ws-tab')) {
		if (!(node instanceof HTMLElement)) {
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
			node.setAttribute(EOL_DOTS_ATTR, '·'.repeat(glueDotCount(node)));
		} else {
			node.removeAttribute(EOL_DOTS_ATTR);
		}
		keep.add(node);
	}
	for (const node of root.querySelectorAll(`.${EOL_WS_CLASS}`)) {
		if (node instanceof HTMLElement && !keep.has(node)) {
			node.classList.remove(EOL_WS_CLASS);
			node.removeAttribute(EOL_DOTS_ATTR);
		}
	}
}

/**
 * Paint trailing (end-of-line) spaces and tabs after each view layout.
 */
export class EolWhitespaceController extends Disposable {
	constructor(view: EditorView) {
		super();
		observeAll(this._store, () => {
			markEolWhitespace(view.element);
		}, view.measuredLayout.measurements, view.documentViewNode);
	}
}
