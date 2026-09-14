import katex from 'katex';
import { Lexer, marked, type Token, type Tokens } from 'marked';
import { CodeBlockAstNode, HeadingAstNode, type MdBlock } from '../core/ast';
import { parseTableSource } from './tableGridModel';

export interface RenderOptions {
	readonly onOpenLink: (href: string) => void;
	readonly onToggleCheckbox: (offset: number, checked: boolean) => void;
	readonly renderCustomCodeBlock?: (language: string, content: string) => HTMLElement | undefined;
	readonly highlightCode?: (language: string, content: string, host: HTMLElement) => void;
}

function el(tag: string, className?: string): HTMLElement {
	const node = document.createElement(tag);
	if (className) {
		node.className = className;
	}
	return node;
}

function renderMath(source: string, displayMode: boolean): HTMLElement {
	const host = el('span', displayMode ? 'md-math md-math-block' : 'md-math md-math-inline');
	try {
		katex.render(source, host, { displayMode, throwOnError: false });
	} catch {
		host.textContent = source;
	}
	return host;
}

function appendText(host: Node, value: string): void {
	if (value.length > 0) {
		host.appendChild(document.createTextNode(value));
	}
}

function renderTextWithMath(text: string): DocumentFragment {
	const fragment = document.createDocumentFragment();
	let i = 0;
	let buffer = '';
	const flush = (): void => {
		appendText(fragment, buffer);
		buffer = '';
	};
	while (i < text.length) {
		if (text[i] === '$' && text[i + 1] !== '$') {
			const close = text.indexOf('$', i + 1);
			if (close > i + 1) {
				flush();
				fragment.append(renderMath(text.slice(i + 1, close), false));
				i = close + 1;
				continue;
			}
		}
		buffer += text[i];
		i++;
	}
	flush();
	return fragment;
}

function renderInlineTokens(tokens: readonly Token[], options: RenderOptions): DocumentFragment {
	const fragment = document.createDocumentFragment();
	for (const token of tokens) {
		if (token.type === 'text') {
			const textToken = token as Tokens.Text;
			if (textToken.tokens?.length) {
				fragment.append(renderInlineTokens(textToken.tokens, options));
			} else {
				fragment.append(renderTextWithMath(textToken.text));
			}
			continue;
		}
		if (token.type === 'strong') {
			const strong = el('strong', 'md-strong');
			strong.append(renderInlineTokens((token as Tokens.Strong).tokens, options));
			fragment.append(strong);
			continue;
		}
		if (token.type === 'em') {
			const em = el('em', 'md-emphasis');
			em.append(renderInlineTokens((token as Tokens.Em).tokens, options));
			fragment.append(em);
			continue;
		}
		if (token.type === 'codespan') {
			const code = el('code');
			code.textContent = (token as Tokens.Codespan).text;
			fragment.append(code);
			continue;
		}
		if (token.type === 'del') {
			const del = el('del', 'md-strikethrough');
			del.append(renderInlineTokens((token as Tokens.Del).tokens, options));
			fragment.append(del);
			continue;
		}
		if (token.type === 'link') {
			const link = token as Tokens.Link;
			if (link.autolink || link.raw.startsWith('<')) {
				appendText(fragment, link.raw);
				continue;
			}
			const anchor = el('a') as HTMLAnchorElement;
			anchor.href = link.href;
			if (link.title) {
				anchor.title = link.title;
			}
			anchor.append(renderInlineTokens(link.tokens, options));
			anchor.addEventListener('click', event => {
				event.preventDefault();
				event.stopPropagation();
				options.onOpenLink(link.href);
			});
			fragment.append(anchor);
			continue;
		}
		if (token.type === 'image') {
			const image = token as Tokens.Image;
			const img = document.createElement('img');
			img.src = image.href;
			img.alt = image.text;
			if (image.title) {
				img.title = image.title;
			}
			fragment.append(img);
			continue;
		}
		if (token.type === 'br') {
			fragment.append(el('br', 'md-hardbreak'));
			continue;
		}
		if (token.type === 'escape') {
			appendText(fragment, (token as Tokens.Escape).text);
			continue;
		}
		if ('tokens' in token && Array.isArray(token.tokens)) {
			fragment.append(renderInlineTokens(token.tokens, options));
			continue;
		}
		if ('text' in token && typeof token.text === 'string') {
			fragment.append(renderTextWithMath(token.text));
			continue;
		}
		appendText(fragment, token.raw);
	}
	return fragment;
}

function renderInline(text: string, options: RenderOptions): DocumentFragment {
	return renderInlineTokens(Lexer.lexInline(text, { gfm: true, breaks: false }), options);
}

function locateRaw(haystack: string, from: number, raw: string): number {
	if (raw.length === 0) {
		return from;
	}
	if (haystack.startsWith(raw, from)) {
		return from;
	}
	const exact = haystack.indexOf(raw, from);
	if (exact !== -1) {
		return exact;
	}
	const firstLine = raw.split('\n')[0] ?? raw;
	if (firstLine.length === 0) {
		return from;
	}
	const lineAt = haystack.indexOf(firstLine, from);
	return lineAt === -1 ? from : lineAt;
}

function renderListToken(
	list: Tokens.List,
	haystack: string,
	from: number,
	blockStart: number,
	options: RenderOptions,
): HTMLElement {
	const host = el(list.ordered ? 'ol' : 'ul', 'md-list');
	if (list.ordered && list.start && list.start !== 1) {
		(host as HTMLOListElement).start = list.start;
	}
	let cursor = from;
	for (const item of list.items) {
		const itemAt = locateRaw(haystack, cursor, item.raw);
		host.append(renderListItem(item, haystack, itemAt, blockStart, options));
		cursor = itemAt + Math.max(1, item.raw.length);
	}
	return host;
}

function renderListItem(
	item: Tokens.ListItem,
	haystack: string,
	itemAt: number,
	blockStart: number,
	options: RenderOptions,
): HTMLElement {
	const li = el('li', item.task ? 'md-list-item md-task-list-item' : 'md-list-item');
	if (item.task) {
		const checkbox = document.createElement('input');
		checkbox.type = 'checkbox';
		checkbox.checked = Boolean(item.checked);
		checkbox.className = 'md-task-checkbox';
		const box = /\[[ xX]\]/.exec(item.raw);
		const offset = blockStart + itemAt + (box?.index ?? 0);
		checkbox.dataset.sourceOffset = String(offset);
		checkbox.addEventListener('click', event => event.stopPropagation());
		checkbox.addEventListener('change', () => options.onToggleCheckbox(offset, checkbox.checked));
		li.append(checkbox);
	}
	let paragraph: HTMLElement | undefined;
	const ensureParagraph = (): HTMLElement => {
		if (!paragraph) {
			paragraph = el('p', 'md-paragraph');
			li.append(paragraph);
		}
		return paragraph;
	};
	for (const child of item.tokens ?? []) {
		if (child.type === 'list') {
			paragraph = undefined;
			li.append(renderListToken(child as Tokens.List, haystack, itemAt, blockStart, options));
			continue;
		}
		const nested = 'tokens' in child && Array.isArray(child.tokens) && child.tokens.length > 0
			? renderInlineTokens(child.tokens, options)
			: renderInline('text' in child && typeof child.text === 'string' ? child.text : child.raw, options);
		ensureParagraph().append(nested);
	}
	return li;
}

function renderList(source: string, blockStart: number, options: RenderOptions): HTMLElement {
	const tokens = marked.lexer(source, { gfm: true, breaks: false });
	const list = tokens.find((token): token is Tokens.List => token.type === 'list');
	if (list) {
		return renderListToken(list, source, 0, blockStart, options);
	}
	const fallback = el('ul', 'md-list');
	const paragraph = el('p', 'md-paragraph');
	paragraph.append(renderInline(source, options));
	const li = el('li', 'md-list-item');
	li.append(paragraph);
	fallback.append(li);
	return fallback;
}

function headingText(source: string): string {
	return source.replace(/^\s{0,3}#{1,6}\s+/, '').replace(/\s+#+\s*$/, '').trimEnd();
}

function mathText(source: string): string {
	return source.replace(/^\s*\$\$\s*/, '').replace(/\s*\$\$\s*$/, '').trim();
}

function quoteText(source: string): string {
	return source.split('\n').map(line => line.replace(/^\s{0,3}>\s?/, '')).join('\n').trimEnd();
}

function renderTable(source: string, options: RenderOptions): HTMLElement {
	const parsed = parseTableSource(source);
	const wrapper = el('div', 'md-table-wrapper');
	const table = document.createElement('table');
	table.className = 'md-table';
	parsed.rows.forEach((row, rowIndex) => {
		const tr = document.createElement('tr');
		row.forEach((cell, col) => {
			const cellEl = document.createElement(rowIndex === 0 ? 'th' : 'td');
			cellEl.className = 'md-table-cell';
			const align = parsed.alignments[col];
			if (align) {
				cellEl.style.textAlign = align;
			}
			cellEl.append(renderInline(cell, options));
			tr.append(cellEl);
		});
		table.append(tr);
	});
	wrapper.append(table);
	return wrapper;
}

export function renderIdleBlock(block: MdBlock, source: string, options: RenderOptions): HTMLElement {
	const slice = source.slice(block.start, block.end);
	if (block instanceof CodeBlockAstNode) {
		const custom = options.renderCustomCodeBlock?.(block.language, block.code);
		const host = el('div', 'md-code-inner');
		if (block.language) {
			host.dataset.ibLanguage = block.language;
		}
		if (custom) {
			host.append(custom);
			return host;
		}
		const pre = el('pre', 'md-code-pre');
		const code = el('code');
		code.textContent = block.code;
		pre.append(code);
		host.append(pre);
		options.highlightCode?.(block.language, block.code, code);
		return host;
	}
	if (block.kind === 'table') {
		return renderTable(slice, options);
	}
	if (block.kind === 'heading' && block instanceof HeadingAstNode) {
		const heading = el(`h${block.depth}`, 'md-heading');
		heading.append(renderInline(headingText(slice), options));
		return heading;
	}
	if (block.kind === 'list') {
		return renderList(slice, block.start, options);
	}
	if (block.kind === 'blockquote') {
		const quote = el('blockquote', 'md-blockquote');
		const paragraph = el('p', 'md-paragraph');
		paragraph.append(renderInline(quoteText(slice), options));
		quote.append(paragraph);
		return quote;
	}
	if (block.kind === 'thematicBreak') {
		return el('hr', 'md-thematic-break');
	}
	if (block.kind === 'math') {
		return renderMath(mathText(slice), true);
	}
	if (block.kind === 'frontMatter') {
		const host = el('div', 'md-front-matter md-unhandled-block');
		const pre = el('pre', 'md-unhandled-scroll');
		pre.textContent = slice;
		host.append(pre);
		return host;
	}
	if (block.kind === 'unhandledBlock') {
		const host = el('div', 'md-unhandled-block');
		const pre = el('pre', 'md-unhandled-scroll');
		pre.textContent = slice;
		host.append(pre);
		return host;
	}
	const paragraph = el('p', 'md-paragraph');
	paragraph.append(renderInline(slice.replace(/\n$/, ''), options));
	return paragraph;
}

export function renderActiveSource(text: string, absoluteStart: number): HTMLElement {
	const host = el('div', 'md-active-source');
	host.dataset.blockStart = String(absoluteStart);
	for (let i = 0; i < text.length; i++) {
		const ch = text[i] ?? '';
		if (ch === ' ') {
			const span = el('span', 'md-ws-space');
			span.textContent = ' ';
			span.dataset.sourceOffset = String(absoluteStart + i);
			host.append(span);
			continue;
		}
		if (ch === '\t') {
			const span = el('span', 'md-ws-tab');
			span.textContent = '\t';
			span.dataset.sourceOffset = String(absoluteStart + i);
			host.append(span);
			continue;
		}
		if (ch === '\n') {
			const newline = el('span', 'md-ws-newline');
			newline.textContent = '\n';
			newline.dataset.sourceOffset = String(absoluteStart + i);
			host.append(newline);
			continue;
		}
		const span = el('span', 'md-text');
		span.dataset.sourceOffset = String(absoluteStart + i);
		let run = ch;
		while (i + 1 < text.length) {
			const next = text[i + 1] ?? '';
			if (next === ' ' || next === '\t' || next === '\n') {
				break;
			}
			run += next;
			i++;
		}
		span.textContent = run;
		host.append(span);
	}
	if (text.length === 0) {
		const zws = el('span', 'md-text');
		zws.dataset.sourceOffset = String(absoluteStart);
		zws.textContent = '\u200b';
		host.append(zws);
	}
	return host;
}

export function resolveSourceOffset(node: Node, offset: number): number | undefined {
	const fromAttr = offsetFromNode(node);
	if (fromAttr !== undefined) {
		return fromAttr + offset;
	}
	if (node instanceof HTMLElement && node.dataset.sourceOffset !== undefined) {
		return Number(node.dataset.sourceOffset) + offset;
	}
	const parent = node.parentElement;
	if (parent) {
		return resolveSourceOffset(parent, 0);
	}
	return undefined;
}

function offsetFromNode(node: Node): number | undefined {
	if (node instanceof HTMLElement && node.dataset.sourceOffset !== undefined) {
		return Number(node.dataset.sourceOffset);
	}
	if (node.parentElement?.dataset.sourceOffset !== undefined) {
		return Number(node.parentElement.dataset.sourceOffset);
	}
	return undefined;
}

export function caretOffsetFromPoint(root: HTMLElement, clientX: number, clientY: number): number | undefined {
	const withPosition = document as Document & {
		caretPositionFromPoint?(x: number, y: number): { offsetNode: Node; offset: number } | null;
	};
	const position = withPosition.caretPositionFromPoint?.(clientX, clientY);
	if (position) {
		if (!root.contains(position.offsetNode) && position.offsetNode !== root) {
			return undefined;
		}
		return resolveSourceOffset(position.offsetNode, position.offset);
	}
	const range = document.caretRangeFromPoint?.(clientX, clientY);
	if (!range) {
		return undefined;
	}
	if (!root.contains(range.startContainer) && range.startContainer !== root) {
		return undefined;
	}
	return resolveSourceOffset(range.startContainer, range.startOffset);
}
