/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { EditorView } from '@vscode/markdown-editor';
import { Disposable, autorun } from '@vscode/observables';

/** Spaces / tabs that sit at the end of a source line (Markdown trailing whitespace). */
export const EOL_WS_CLASS = 'ib-md-eol-ws';

const ELEMENT_NODE = 1;
const TEXT_NODE = 3;
const COMMENT_NODE = 8;

const LINE_END_CLASSES = new Set([
	'md-ws-newline',
	'md-ws-newline-glyph',
	'md-ws-blockbreak-glyph',
	'md-hardbreak',
]);

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
		return (node.textContent ?? '').length === 0;
	}
	return false;
}

/** Next node after `node` in document order, skipping the subtree of `node`. */
function nextAfter(node: WhitespaceWalkNode): WhitespaceWalkNode | null {
	if (node.nextSibling) {
		return node.nextSibling;
	}
	let parent = node.parentNode ?? null;
	while (parent) {
		if (parent.nextSibling) {
			return parent.nextSibling;
		}
		parent = parent.parentNode ?? null;
	}
	return null;
}

/**
 * True when this space/tab is only followed by more trailing whitespace
 * or a line break. Indent glue (spaces in their own parent before content)
 * is not trailing.
 */
export function isEolWhitespaceSpan(el: WhitespaceWalkNode): boolean {
	if (!isWhitespaceSpan(el)) {
		return false;
	}
	let node = nextAfter(el);
	while (node) {
		if (isIgnorable(node)) {
			node = nextAfter(node);
			continue;
		}
		if (node.nodeType === TEXT_NODE) {
			const value = node.textContent ?? '';
			if (/[\n\r]/.test(value)) {
				return true;
			}
			if (/^\s+$/.test(value)) {
				node = nextAfter(node);
				continue;
			}
			return false;
		}
		if (node.nodeType === ELEMENT_NODE) {
			if (isLineEnd(node)) {
				return true;
			}
			if (isWhitespaceSpan(node)) {
				node = nextAfter(node);
				continue;
			}
			if (node.firstChild) {
				node = node.firstChild;
				continue;
			}
			node = nextAfter(node);
			continue;
		}
		node = nextAfter(node);
	}
	return true;
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
	for (const node of root.querySelectorAll(`.${EOL_WS_CLASS}`)) {
		if (node instanceof HTMLElement && !keep.has(node)) {
			node.classList.remove(EOL_WS_CLASS);
		}
	}
}

/**
 * Paint trailing (end-of-line) spaces and tabs after each view layout.
 */
export class EolWhitespaceController extends Disposable {
	constructor(view: EditorView) {
		super();
		this._register(autorun((reader) => {
			reader.readObservable(view.measuredLayout.measurements);
			markEolWhitespace(view.element);
		}));
	}
}
