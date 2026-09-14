import { marked, type Token, type Tokens } from 'marked';
import {
	CodeBlockAstNode,
	DefinitionAstNode,
	emptyDocument,
	FrontMatterAstNode,
	FrontMatterValueNode,
	HeadingAstNode,
	HtmlFlowAstNode,
	ListAstNode,
	MdBlock,
	TableAstNode,
	type DocumentAstNode,
} from './ast';

export interface ParsedBlock {
	readonly block: MdBlock;
}

export interface ParsedDocument extends DocumentAstNode {
	readonly parsed: readonly ParsedBlock[];
}

function readLine(source: string, start: number): { start: number; next: number; text: string } | undefined {
	if (start >= source.length) {
		return undefined;
	}
	let end = start;
	while (end < source.length && source.charCodeAt(end) !== 10) {
		end++;
	}
	let text = source.slice(start, end);
	if (text.endsWith('\r')) {
		text = text.slice(0, -1);
	}
	const next = end < source.length ? end + 1 : end;
	return { start, next, text };
}

function frontMatterEnd(source: string): number | undefined {
	const open = readLine(source, 0);
	if (!open || !/^---[ \t]*$/.test(open.text)) {
		return undefined;
	}
	let offset = open.next;
	while (offset < source.length) {
		const line = readLine(source, offset);
		if (!line) {
			return undefined;
		}
		if (/^---[ \t]*$/.test(line.text) || /^\.\.\.[ \t]*$/.test(line.text)) {
			return line.next;
		}
		offset = line.next;
	}
	return undefined;
}

function consumeRaw(source: string, cursor: number, raw: string): { start: number; end: number } {
	if (raw.length === 0) {
		return { start: cursor, end: cursor };
	}
	if (source.startsWith(raw, cursor)) {
		return { start: cursor, end: cursor + raw.length };
	}
	const start = source.indexOf(raw, cursor);
	if (start === -1) {
		return { start: cursor, end: Math.min(source.length, cursor + raw.length) };
	}
	return { start, end: start + raw.length };
}

function isMathRaw(raw: string): boolean {
	const trimmed = raw.trim();
	return trimmed === '$$' || (trimmed.startsWith('$$') && trimmed.endsWith('$$') && trimmed.length > 4);
}

function fenceCodeOffset(raw: string): number {
	const open = /^( {0,3})(`{3,}|~{3,})[^\n]*\n/.exec(raw);
	return open ? open[0].length : 0;
}

function blockFromToken(id: number, start: number, end: number, token: Token, raw: string): MdBlock {
	if (token.type === 'code') {
		const code = token as Tokens.Code;
		return new CodeBlockAstNode(id, start, end, code.lang ?? '', fenceCodeOffset(raw), code.text);
	}
	if (token.type === 'table') {
		return new TableAstNode(id, start, end);
	}
	if (token.type === 'heading') {
		return new HeadingAstNode(id, start, end, (token as Tokens.Heading).depth);
	}
	if (token.type === 'list') {
		return new ListAstNode(id, start, end);
	}
	if (token.type === 'blockquote') {
		return new MdBlock(id, 'blockquote', start, end);
	}
	if (token.type === 'hr') {
		return new MdBlock(id, 'thematicBreak', start, end);
	}
	if (token.type === 'html') {
		return new HtmlFlowAstNode(id, start, end, { content: raw });
	}
	if (token.type === 'def') {
		return new DefinitionAstNode(id, start, end);
	}
	if (token.type === 'paragraph' && isMathRaw(raw)) {
		return new MdBlock(id, 'math', start, end);
	}
	return new MdBlock(id, 'paragraph', start, end);
}

export function parseMarkdown(source: string): ParsedDocument {
	if (source.length === 0) {
		return { ...emptyDocument(), parsed: [] };
	}

	let nextId = 1;
	const blocks: MdBlock[] = [];
	const parsed: ParsedBlock[] = [];
	let offset = 0;

	const push = (block: MdBlock): void => {
		blocks.push(block);
		parsed.push({ block });
	};

	const yamlEnd = frontMatterEnd(source);
	if (yamlEnd !== undefined) {
		const id = nextId;
		nextId += 2;
		const open = readLine(source, 0);
		const openFence = { content: source.slice(0, open?.next ?? 4) };
		let closeLineStart = yamlEnd;
		let scan = open?.next ?? 0;
		while (scan < yamlEnd) {
			const line = readLine(source, scan);
			if (!line) {
				break;
			}
			if (/^---[ \t]*$/.test(line.text) && scan !== 0) {
				closeLineStart = line.start;
				break;
			}
			scan = line.next;
		}
		const yaml = source.slice(openFence.content.length, closeLineStart);
		const value = new FrontMatterValueNode(id + 1, openFence.content.length, closeLineStart, yaml);
		push(new FrontMatterAstNode(id, 0, yamlEnd, value, openFence));
		offset = yamlEnd;
	}

	const body = source.slice(offset);
	const tokens = marked.lexer(body, { gfm: true, breaks: false });
	let cursor = offset;
	for (const token of tokens) {
		if (token.type === 'space') {
			cursor = consumeRaw(source, cursor, token.raw).end;
			continue;
		}
		const range = consumeRaw(source, cursor, token.raw);
		const id = nextId;
		nextId += 2;
		push(blockFromToken(id, range.start, range.end, token, token.raw));
		cursor = range.end;
	}

	return {
		kind: 'document',
		blocks,
		length: source.length,
		parsed,
	};
}
