/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

const ALLOWED_TAGS = new Set([
	'A',
	'ABBR',
	'B',
	'BLOCKQUOTE',
	'BR',
	'CODE',
	'DEL',
	'DETAILS',
	'DIV',
	'EM',
	'FIGCAPTION',
	'FIGURE',
	'H1',
	'H2',
	'H3',
	'H4',
	'H5',
	'H6',
	'HR',
	'I',
	'IMG',
	'INS',
	'KBD',
	'LI',
	'MARK',
	'OL',
	'P',
	'PRE',
	'S',
	'SPAN',
	'STRONG',
	'SUB',
	'SUMMARY',
	'SUP',
	'TABLE',
	'TBODY',
	'TD',
	'TFOOT',
	'TH',
	'THEAD',
	'TR',
	'U',
	'UL',
]);

const DANGEROUS_TAGS = new Set([
	'SCRIPT',
	'IFRAME',
	'OBJECT',
	'EMBED',
	'FORM',
	'INPUT',
	'BUTTON',
	'TEXTAREA',
	'SELECT',
	'LINK',
	'META',
	'BASE',
	'STYLE',
	'TEMPLATE',
	'NOSCRIPT',
	'SVG',
	'MATH',
]);

const VOID_TAGS = new Set(['BR', 'HR', 'IMG']);

const ALLOWED_ATTRS = new Set([
	'alt',
	'class',
	'colspan',
	'href',
	'id',
	'name',
	'open',
	'rowspan',
	'src',
	'title',
]);

const URL_ATTRS = new Set(['href', 'src']);

function isSafeUrl(value: string, attr: string): boolean {
	const trimmed = value.trim().toLowerCase();
	if (trimmed.startsWith('javascript:') || trimmed.startsWith('vbscript:')) {
		return false;
	}
	if (attr === 'href' && trimmed.startsWith('data:')) {
		return false;
	}
	return true;
}

function cleanNode(node: Node): Node | undefined {
	if (node.nodeType === Node.TEXT_NODE) {
		return document.createTextNode(node.textContent ?? '');
	}
	if (node.nodeType !== Node.ELEMENT_NODE || !(node instanceof Element)) {
		return undefined;
	}

	const tag = node.tagName;
	if (DANGEROUS_TAGS.has(tag)) {
		return undefined;
	}

	if (!ALLOWED_TAGS.has(tag)) {
		const fragment = document.createDocumentFragment();
		for (const child of [...node.childNodes]) {
			const cleaned = cleanNode(child);
			if (cleaned) {
				fragment.appendChild(cleaned);
			}
		}
		return fragment.childNodes.length > 0 ? fragment : undefined;
	}

	const element = document.createElement(tag.toLowerCase());
	for (const attr of [...node.attributes]) {
		const name = attr.name.toLowerCase();
		if (name.startsWith('on') || name === 'srcdoc') {
			continue;
		}
		if (!ALLOWED_ATTRS.has(name)) {
			continue;
		}
		if (URL_ATTRS.has(name) && !isSafeUrl(attr.value, name)) {
			continue;
		}
		element.setAttribute(name, attr.value);
	}

	if (!VOID_TAGS.has(tag)) {
		for (const child of [...node.childNodes]) {
			const cleaned = cleanNode(child);
			if (cleaned) {
				element.appendChild(cleaned);
			}
		}
	}

	return element;
}

/** Strip scripts, event handlers, and unsafe URLs. Keep a Markdown-preview tag subset. */
export function sanitizeHtml(html: string): string {
	const parsed = new DOMParser().parseFromString(html, 'text/html');
	const out = document.createElement('div');
	for (const child of [...parsed.body.childNodes]) {
		const cleaned = cleanNode(child);
		if (cleaned) {
			out.appendChild(cleaned);
		}
	}
	return out.innerHTML;
}
