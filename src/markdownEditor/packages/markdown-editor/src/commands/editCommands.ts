import { OffsetRange } from '../core/offsetRange.js';
import { Selection } from '../core/selection.js';
import { StringEdit, StringReplacement } from '../core/stringEdit.js';
import { findWordDeleteBoundaryLeft, findWordDeleteBoundaryRight } from '../core/wordUtils.js';
import { hiddenCursorRanges, nextCursorPosition } from '../model/cursorNavigation.js';
import { trailingEmptyLineGap } from '../model/emptyLineGap.js';
import {
	findNodeOffsetById, GlueAstNode, ListAstNode, ListItemAstNode, UnhandledBlockAstNode,
	type AstNode, type BlockAstNode, type CodeBlockAstNode, type DocumentAstNode, type FrontMatterAstNode,
} from '../parser/ast.js';
import type { CursorCommandContext, EditCommand } from './types.js';

/** Controls tab-stop insertion and non-list line indentation. */
export interface IndentationConfig {
	/** Number of visual columns between tab stops. */
	readonly tabSize: number;
	/** Whether indentation uses spaces instead of tab characters. */
	readonly insertSpaces: boolean;
}

export const DEFAULT_INDENTATION_CONFIG: IndentationConfig = {
	tabSize: 4,
	insertSpaces: true,
};

const LIST_INDENTATION = '  ';
const FENCE_LINE = /^([ \t]*)(`{3,}|~{3,})([ \t]*)$/;
const OPEN_FENCE = /^([ \t]*)(`{3,}|~{3,})/;

export const deleteLeft: EditCommand = (ctx) => {
	const sel = ctx.selection;
	if (!sel.isCollapsed) {
		return deleteSelectionKeepingEmptyLineIcons(ctx);
	}
	if (sel.active === 0) { return undefined; }
	const deleteRange = new OffsetRange(nextCursorPosition(ctx.document, ctx.markerVisibleBlocks, sel.active, 'left', sel.range), sel.active);
	return {
		edit: StringEdit.delete(deleteRange),
		selection: Selection.collapsed(deleteRange.start),
	};
};

export const deleteRight: EditCommand = (ctx) => {
	const sel = ctx.selection;
	if (!sel.isCollapsed) {
		return deleteSelectionKeepingEmptyLineIcons(ctx);
	}
	if (sel.active >= ctx.text.length) { return undefined; }
	const deleteRange = new OffsetRange(sel.active, nextCursorPosition(ctx.document, ctx.markerVisibleBlocks, sel.active, 'right', sel.range));
	return {
		edit: StringEdit.delete(deleteRange),
		selection: Selection.collapsed(deleteRange.start),
	};
};

export const deleteWordLeft: EditCommand = (ctx) => {
	const sel = ctx.selection;
	if (!sel.isCollapsed) {
		return deleteSelectionKeepingEmptyLineIcons(ctx);
	}
	if (sel.active === 0) { return undefined; }
	const boundary = findWordDeleteBoundaryLeft(ctx.text, sel.active, ctx.wordNavigationConfig);
	const deleteRange = new OffsetRange(boundary, sel.active);
	const edit = deleteVisibleRange(ctx, deleteRange);
	if (edit.isEmpty) { return undefined; }
	return {
		edit,
		selection: Selection.collapsed(edit.mapOffset(boundary)),
	};
};

export const deleteWordRight: EditCommand = (ctx) => {
	const sel = ctx.selection;
	if (!sel.isCollapsed) {
		return deleteSelectionKeepingEmptyLineIcons(ctx);
	}
	if (sel.active >= ctx.text.length) { return undefined; }
	const boundary = findWordDeleteBoundaryRight(ctx.text, sel.active, ctx.wordNavigationConfig);
	const deleteRange = new OffsetRange(sel.active, boundary);
	const edit = deleteVisibleRange(ctx, deleteRange);
	if (edit.isEmpty) { return undefined; }
	return {
		edit,
		selection: Selection.collapsed(edit.mapOffset(sel.active)),
	};
};

export const deleteLineLeft: EditCommand = (ctx) => {
	const sel = ctx.selection;
	if (!sel.isCollapsed) {
		return deleteSelectionKeepingEmptyLineIcons(ctx);
	}
	if (sel.active === 0) { return undefined; }
	let start = ctx.text.lastIndexOf('\n', sel.active - 1) + 1;
	if (start === sel.active && start > 0) { start--; }
	if (start === sel.active) { return undefined; }
	const edit = deleteVisibleRange(ctx, new OffsetRange(start, sel.active));
	if (edit.isEmpty) { return undefined; }
	return {
		edit,
		selection: Selection.collapsed(edit.mapOffset(start)),
	};
};

export const deleteLineRight: EditCommand = (ctx) => {
	const sel = ctx.selection;
	if (!sel.isCollapsed) {
		return deleteSelectionKeepingEmptyLineIcons(ctx);
	}
	const newline = ctx.text.indexOf('\n', sel.active);
	const end = newline === -1
		? ctx.text.length
		: newline === sel.active
			? newline + 1
			: newline;
	if (end === sel.active) { return undefined; }
	const edit = deleteVisibleRange(ctx, new OffsetRange(sel.active, end));
	if (edit.isEmpty) { return undefined; }
	return {
		edit,
		selection: Selection.collapsed(edit.mapOffset(sel.active)),
	};
};

/** A selection delete leaves empty-line `↵` icons in place. The caret deletes one by sitting on it. */
function deleteSelectionKeepingEmptyLineIcons(ctx: CursorCommandContext): { edit: StringEdit; selection: Selection } | undefined {
	const edit = deleteKeepingEmptyLineGaps(ctx.document, ctx.selection.range);
	if (edit.isEmpty) { return undefined; }
	return {
		edit,
		selection: Selection.collapsed(ctx.selection.range.start),
	};
}

function deleteKeepingEmptyLineGaps(doc: DocumentAstNode, range: OffsetRange): StringEdit {
	const gaps: OffsetRange[] = [];
	const blocks = new Set(doc.blocks);
	let pos = 0;
	for (const child of doc.children) {
		if (blocks.has(child as BlockAstNode)) {
			const gap = trailingEmptyLineGap(child as BlockAstNode, pos);
			if (gap && gap.endExclusive > range.start && gap.start < range.endExclusive) {
				gaps.push(gap);
			}
		}
		pos += child.length;
	}
	const replacements: StringReplacement[] = [];
	let start = range.start;
	for (const gap of gaps) {
		if (gap.endExclusive <= start) { continue; }
		if (gap.start >= range.endExclusive) { break; }
		if (start < gap.start) {
			replacements.push(StringReplacement.delete(new OffsetRange(start, Math.min(gap.start, range.endExclusive))));
		}
		start = Math.max(start, gap.endExclusive);
	}
	if (start < range.endExclusive) {
		replacements.push(StringReplacement.delete(new OffsetRange(start, range.endExclusive)));
	}
	return replacements.length === 0 ? StringEdit.empty : new StringEdit(replacements);
}

function deleteVisibleRange(ctx: CursorCommandContext, range: OffsetRange): StringEdit {
	const replacements: StringReplacement[] = [];
	let start = range.start;
	for (const hidden of hiddenCursorRanges(
		ctx.document,
		ctx.markerVisibleBlocks,
		ctx.selection.range,
	)) {
		if (hidden.endExclusive <= start) { continue; }
		if (hidden.start >= range.endExclusive) { break; }
		if (start < hidden.start) {
			replacements.push(StringReplacement.delete(new OffsetRange(start, Math.min(hidden.start, range.endExclusive))));
		}
		start = Math.max(start, hidden.endExclusive);
	}
	if (start < range.endExclusive) {
		replacements.push(StringReplacement.delete(new OffsetRange(start, range.endExclusive)));
	}
	return replacements.length === 0 ? StringEdit.empty : new StringEdit(replacements);
}

export function insertText(text: string, generatedIndentation?: OffsetRange): EditCommand {
	return (ctx) => {
		const closingFence = _closingFenceInput(ctx, text, generatedIndentation);
		if (closingFence) { return closingFence; }
		const edit = StringEdit.replace(ctx.selection.range, text);
		const newOffset = ctx.selection.range.start + text.length;
		return {
			edit,
			selection: Selection.collapsed(newOffset),
		};
	};
}

/**
 * A fenced block copies the current indentation on Enter. If that indentation
 * is too deep for Markdown to recognize a closing fence, typing a matching
 * fence moves it back to the opening fence's indentation.
 */
function _closingFenceInput(
	ctx: CursorCommandContext,
	text: string,
	generatedIndentation: OffsetRange | undefined,
): { readonly edit: StringEdit; readonly selection: Selection } | undefined {
	const block = ctx.activeBlock;
	if (
		block?.kind !== 'codeBlock'
		|| block.language !== 'mermaid'
		|| block.closeFence
		|| !block.openFence
		|| !generatedIndentation
	) {
		return undefined;
	}

	const range = ctx.selection.range;
	const lineStart = ctx.text.lastIndexOf('\n', range.start - 1) + 1;
	const nextLineBreak = ctx.text.indexOf('\n', range.endExclusive);
	const lineEnd = nextLineBreak < 0 ? ctx.text.length : nextLineBreak;
	const candidate = ctx.text.slice(lineStart, range.start) + text + ctx.text.slice(range.endExclusive, lineEnd);
	const candidateFence = FENCE_LINE.exec(candidate);
	if (!candidateFence) { return undefined; }
	const candidateIndent = candidateFence[1];
	if (
		generatedIndentation.start !== lineStart
		|| generatedIndentation.endExclusive > range.start
		|| generatedIndentation.length !== candidateIndent.length
		|| generatedIndentation.substring(ctx.text) !== candidateIndent
	) {
		return undefined;
	}

	const blockStart = findNodeOffsetById(ctx.document, block);
	if (blockStart === undefined) { return undefined; }
	const openingLineStart = ctx.text.lastIndexOf('\n', blockStart - 1) + 1;
	if (openingLineStart === lineStart) { return undefined; }
	const openingLineEnd = ctx.text.indexOf('\n', openingLineStart);
	const openingLine = ctx.text.slice(openingLineStart, openingLineEnd < 0 ? ctx.text.length : openingLineEnd);
	const openingFence = OPEN_FENCE.exec(openingLine);
	if (
		!openingFence
		|| candidateFence[2][0] !== openingFence[2][0]
		|| candidateFence[2].length < openingFence[2].length
	) {
		return undefined;
	}

	if (!candidateIndent.includes('\t') && candidateIndent.length <= 3) { return undefined; }

	const openingIndent = openingFence[1];
	if (!candidateIndent.startsWith(openingIndent) || candidateIndent.length <= openingIndent.length) {
		return undefined;
	}
	const normalized = openingIndent + candidateFence[2] + candidateFence[3];
	const candidateCursor = ctx.text.slice(lineStart, range.start).length + text.length;
	const normalizedCursor = openingIndent.length + Math.max(0, candidateCursor - candidateIndent.length);
	return {
		edit: StringEdit.replace(new OffsetRange(lineStart, lineEnd), normalized),
		selection: Selection.collapsed(lineStart + normalizedCursor),
	};
}

/**
 * VS Code-style Tab: insert to the next tab stop for a caret or partial
 * single-line selection, and indent every selected line for a line selection.
 */
export function insertTab(config: IndentationConfig = DEFAULT_INDENTATION_CONFIG): EditCommand {
	validateIndentationConfig(config);
	return (ctx) => {
		const selection = ctx.selection;
		const range = selection.range;
		const firstLineStart = lineStart(ctx.text, range.start);
		const firstLineEnd = lineEnd(ctx.text, range.start);
		const isSingleLine = range.endExclusive <= firstLineEnd;
		const isPartialSingleLine = isSingleLine
			&& (range.start !== firstLineStart || range.endExclusive !== firstLineEnd);

		const listItem = selection.isCollapsed
			? findListItemForCaret(ctx.document, ctx.text, selection.active)
			: undefined;
		const listItemOffset = listItem ? findNodeOffsetById(ctx.document, listItem.item) : undefined;
		const listMarkerOffset = listItem ? findNodeOffsetById(ctx.document, listItem.item.marker) : undefined;
		if (
			listItem
			&& listItemOffset !== undefined
			&& listMarkerOffset !== undefined
			&& lineStart(ctx.text, listMarkerOffset) === firstLineStart
		) {
			const lineContentStarts = listItemLineContentStarts(
				ctx.text,
				listItemOffset,
				listItemOffset + listItem.item.length,
				blockQuotePrefixDepth(ctx.text, lineStart(ctx.text, listMarkerOffset), listMarkerOffset),
			);
			const markerLineContentStart = lineContentStarts[0];
			if (
				listItem.index === 0
				&& listMarkerOffset - markerLineContentStart >= LIST_INDENTATION.length
			) {
				return undefined;
			}
			const replacements = lineContentStarts
				.filter(start => start < lineEnd(ctx.text, start))
				.map(start => StringReplacement.insert(start, LIST_INDENTATION));
			const edit = new StringEdit(replacements);
			return {
				edit,
				selection: Selection.collapsed(edit.mapOffset(selection.active)),
			};
		}

		if (selection.isCollapsed || isPartialSingleLine) {
			const text = tabTextForLinePrefix(
				ctx.text.slice(lineStart(ctx.text, range.start), range.start),
				config,
			);
			return {
				edit: StringEdit.replace(range, text),
				selection: Selection.collapsed(range.start + text.length),
			};
		}

		const lineStarts = selectedLineStarts(ctx.text, range);
		const replacements = lineStarts.map(start => StringReplacement.insert(start, indentationUnit(config)));
		const edit = new StringEdit(replacements);
		return {
			edit,
			selection: mapLineIndentSelection(edit, selection, new Set(lineStarts)),
		};
	};
}

/** Outdent the current line, or every line touched by the selection. */
export function outdent(config: IndentationConfig = DEFAULT_INDENTATION_CONFIG): EditCommand {
	validateIndentationConfig(config);
	return (ctx) => {
		if (ctx.selection.isCollapsed) {
			const listItem = findListItemForCaret(ctx.document, ctx.text, ctx.selection.active);
			const itemOffset = listItem ? findNodeOffsetById(ctx.document, listItem.item) : undefined;
			const markerOffset = listItem ? findNodeOffsetById(ctx.document, listItem.item.marker) : undefined;
			if (
				listItem
				&& itemOffset !== undefined
				&& markerOffset !== undefined
				&& lineStart(ctx.text, markerOffset) === lineStart(ctx.text, ctx.selection.active)
			) {
				const replacements = listItemLineContentStarts(
					ctx.text,
					itemOffset,
					itemOffset + listItem.item.length,
					blockQuotePrefixDepth(ctx.text, lineStart(ctx.text, markerOffset), markerOffset),
				).flatMap(start => ctx.text.slice(start, start + LIST_INDENTATION.length) === LIST_INDENTATION
					? [StringReplacement.delete(new OffsetRange(start, start + LIST_INDENTATION.length))]
					: []);
				if (replacements.length === 0) { return undefined; }
				const edit = new StringEdit(replacements);
				return {
					edit,
					selection: Selection.collapsed(edit.mapOffset(ctx.selection.active)),
				};
			}
		}

		const replacements: StringReplacement[] = [];
		for (const start of selectedLineStarts(ctx.text, ctx.selection.range)) {
			const end = leadingWhitespaceEnd(ctx.text, start);
			const currentIndent = ctx.text.slice(start, end);
			const outdented = outdentWhitespace(currentIndent, config);
			if (outdented === currentIndent) { continue; }
			replacements.push(StringReplacement.replace(
				new OffsetRange(start, end),
				outdented,
			));
		}
		if (replacements.length === 0) { return undefined; }
		const edit = new StringEdit(replacements);
		return {
			edit,
			selection: mapSelection(edit, ctx.selection),
		};
	};
}

export const insertParagraph: EditCommand = (ctx) => {
	const edit = StringEdit.replace(ctx.selection.range, '\n\n');
	const newOffset = ctx.selection.range.start + 2;
	return {
		edit,
		selection: Selection.collapsed(newOffset),
	};
};

export const insertLineBreak: EditCommand = (ctx) => {
	const edit = StringEdit.replace(ctx.selection.range, '\n');
	const newOffset = ctx.selection.range.start + 1;
	return {
		edit,
		selection: Selection.collapsed(newOffset),
	};
};

/**
 * A Markdown hard line break: a `\n` whose preceding line ends with two spaces.
 * Any spaces already trailing the insertion point count toward the two, so the
 * line never accumulates more than the two needed to form the break.
 */
export const insertHardLineBreak: EditCommand = (ctx) => {
	const start = ctx.selection.range.start;
	let existingSpaces = 0;
	while (existingSpaces < 2 && ctx.text[start - 1 - existingSpaces] === ' ') { existingSpaces++; }
	const padding = ' '.repeat(2 - existingSpaces);
	const inserted = padding + '\n';
	const edit = StringEdit.replace(ctx.selection.range, inserted);
	const newOffset = start + inserted.length;
	return {
		edit,
		selection: Selection.collapsed(newOffset),
	};
};

/**
 * The outcome of {@link insertSmartEnter}: either a concrete source edit (the
 * ordinary cases), or a request to arm a transient empty paragraph (Enter at
 * the very end of a paragraph), which the controller turns into
 * {@link EditorModel.armPendingParagraph} rather than a source edit. Modelling
 * the empty paragraph as state instead of source keeps the document valid
 * Markdown — which has no empty-paragraph node — until the user actually types.
 */
export type SmartEnterResult =
	| {
		readonly kind: 'edit';
		readonly edit: StringEdit;
		readonly selection: Selection;
		/** Post-edit range of indentation copied onto a new fenced-code line. */
		readonly generatedIndentation?: OffsetRange;
	}
	| PendingParagraphResult;

export interface PendingParagraphResult {
	readonly kind: 'pending';
	readonly anchorBlock: BlockAstNode;
	readonly replaceRange: OffsetRange;
	/** Whether materialized text needs a blank-line separator before it. */
	readonly separateFromPreviousBlock: boolean;
	readonly atEof: boolean;
}

/**
 * Arrow Down at the end of the last list item arms a paragraph after the list.
 * Enter still continues the list; this only runs from the pending-paragraph path.
 */
function _pendingParagraphAfterListEnd(
	ctx: CursorCommandContext,
	block: BlockAstNode,
	blockStart: number,
): PendingParagraphResult | undefined {
	const located = findListItemForCaret(ctx.document, ctx.text, ctx.selection.active);
	if (!located) { return undefined; }
	const lastItem = located.list.items[located.list.items.length - 1];
	if (located.item !== lastItem) { return undefined; }
	const paragraph = lastItem.blocks.find(child => child.kind === 'paragraph');
	if (!paragraph) { return undefined; }
	const paragraphStart = _blockAbsoluteStart(ctx.document, paragraph);
	if (paragraphStart === undefined) { return undefined; }
	const textEnd = _blockTextEnd(paragraph, paragraphStart);
	if (ctx.selection.active < textEnd) { return undefined; }
	const listEnd = blockStart + block.length;
	return {
		kind: 'pending',
		anchorBlock: block,
		replaceRange: new OffsetRange(textEnd, listEnd),
		separateFromPreviousBlock: true,
		atEof: listEnd >= ctx.text.length,
	};
}

/**
 * Return the source-less paragraph that Enter or a no-op Arrow Down may enter
 * after a completed block. Cases where Enter must edit source instead (such as
 * continuing a list or an unclosed fence) deliberately return `undefined`.
 */
export function pendingParagraphAfterCompletedBlock(ctx: CursorCommandContext): PendingParagraphResult | undefined {
	const block = ctx.activeBlock;
	if (!ctx.selection.isCollapsed || !block) { return undefined; }
	const blockStart = _blockAbsoluteStart(ctx.document, block);
	if (blockStart === undefined) { return undefined; }

	switch (block.kind) {
		case 'paragraph':
		case 'heading':
		case 'thematicBreak':
		case 'video':
			return ctx.selection.active >= _blockTextEnd(block, blockStart)
				? _pendingParagraphAfterBlock(ctx, block, blockStart)
				: undefined;
		case 'frontMatter':
		case 'codeBlock':
			return block.closeFence && ctx.selection.active >= _blockTextEnd(block, blockStart)
				? _pendingParagraphAfterBlock(ctx, block, blockStart)
				: undefined;
		case 'blockQuote':
			return blockQuoteExitPendingParagraph(ctx);
		case 'list':
			return _pendingParagraphAfterListEnd(ctx, block, blockStart);
		case 'unhandledBlock': {
			const comment = block.htmlComment;
			if (comment?.kind !== 'complete') { return undefined; }
			const commentEnd = blockStart
				+ comment.leadingWhitespace.length
				+ comment.opening.length
				+ comment.body.length
				+ comment.closing.length;
			return ctx.selection.active >= commentEnd
				? _pendingParagraphAfterBlock(ctx, block, blockStart)
				: undefined;
		}
		default:
			return undefined;
	}
}

/**
 * Context-aware Enter. The behaviour is chosen from the active block:
 *  - paragraph / heading / thematic break — the "rich text" thing: at the
 *    block's end arm a transient empty paragraph (see {@link SmartEnterResult});
 *    elsewhere split into two paragraphs (`\n\n`).
 *  - fenced code / front matter — insert a newline that preserves the current
 *    line's indentation, staying inside the fences.
 *  - video — leave the completed HTML block at its end; otherwise insert a
 *    normal source line break.
 *  - block quote — continue the quote (`\n> `); an empty quote line exits it.
 *  - list — continue the list with the next marker (incrementing ordered
 *    numbers, re-emitting task checkboxes); an empty item outdents one level
 *    before exiting the list.
 *  - complete HTML comment — at the comment's end, leave it by arming a
 *    transient paragraph; inside it (or while the comment is open), insert a
 *    normal source line break.
 * A non-collapsed selection, or any other block, falls back to a plain soft line
 * break, preserving today's behaviour.
 */
export const insertSmartEnter = (ctx: CursorCommandContext): SmartEnterResult => {
	const sel = ctx.selection;
	const block = ctx.activeBlock;
	if (!sel.isCollapsed || !block) {
		return _lineBreak(ctx);
	}
	switch (block.kind) {
		case 'paragraph':
		case 'heading':
		case 'thematicBreak':
			return _paragraphLikeEnter(ctx, block);
		case 'video':
			return pendingParagraphAfterCompletedBlock(ctx) ?? _lineBreak(ctx);
		case 'frontMatter':
		case 'codeBlock':
			return _fencedBlockEnter(ctx, block);
		case 'blockQuote':
			return _blockQuoteEnter(ctx);
		case 'list':
			return _listEnter(ctx);
		case 'unhandledBlock':
			return _htmlCommentEnter(ctx, block);
		default:
			return _lineBreak(ctx);
	}
};

/** Paragraph-like Enter: pending empty paragraph at the end, split otherwise. */
function _paragraphLikeEnter(ctx: CursorCommandContext, block: BlockAstNode): SmartEnterResult {
	const sel = ctx.selection;
	const start = _blockAbsoluteStart(ctx.document, block);
	if (start === undefined) { return _lineBreak(ctx); }

	const textEnd = _blockTextEnd(block, start);
	if (sel.active < textEnd) {
		// Mid-block: split into two paragraphs.
		return {
			kind: 'edit',
			edit: StringEdit.replace(sel.range, '\n\n'),
			selection: Selection.collapsed(sel.range.start + 2),
		};
	}

	return pendingParagraphAfterCompletedBlock(ctx) ?? _lineBreak(ctx);
}

/**
 * Fenced-block Enter: after a closing fence, leave the block; otherwise insert
 * a newline that copies the current line's leading whitespace.
 */
function _fencedBlockEnter(ctx: CursorCommandContext, block: CodeBlockAstNode | FrontMatterAstNode): SmartEnterResult {
	const sel = ctx.selection;
	const pending = pendingParagraphAfterCompletedBlock(ctx);
	if (pending) { return pending; }
	const lineStart = ctx.text.lastIndexOf('\n', sel.active - 1) + 1;
	let i = lineStart;
	while (i < sel.active && (ctx.text[i] === ' ' || ctx.text[i] === '\t')) { i++; }
	const indentation = ctx.text.slice(lineStart, i);
	const inserted = '\n' + indentation;
	const result = _insertAt(sel, inserted);
	if (result.kind !== 'edit' || block.kind !== 'codeBlock' || indentation.length === 0) {
		return result;
	}
	return {
		...result,
		generatedIndentation: OffsetRange.ofStartAndLength(sel.active + 1, indentation.length),
	};
}

function _pendingParagraphAfterBlock(
	ctx: CursorCommandContext,
	block: BlockAstNode,
	blockStart: number,
): PendingParagraphResult {
	const textEnd = _blockTextEnd(block, blockStart);
	const gapEnd = blockStart + block.length;
	return {
		kind: 'pending',
		anchorBlock: block,
		replaceRange: new OffsetRange(textEnd, gapEnd),
		separateFromPreviousBlock: true,
		atEof: gapEnd >= ctx.text.length,
	};
}

/** Complete-comment Enter: leave at/after `-->`; otherwise keep editing source. */
function _htmlCommentEnter(ctx: CursorCommandContext, block: UnhandledBlockAstNode): SmartEnterResult {
	const comment = block.htmlComment;
	if (comment?.kind !== 'complete') { return _lineBreak(ctx); }
	return pendingParagraphAfterCompletedBlock(ctx) ?? _lineBreak(ctx);
}

function _blockTextEnd(block: BlockAstNode, blockStart: number): number {
	return blockStart + block.length - _trailingGlueLength(block);
}

/** Block-quote Enter: continue with the line's `> ` prefix; empty line exits. */
function _blockQuoteEnter(ctx: CursorCommandContext): SmartEnterResult {
	const sel = ctx.selection;
	const line = _blockQuoteLineAt(ctx.text, sel.active);
	const prefix = line.prefix ?? '> ';
	const body = line.content.slice(prefix.length);
	if (body.trim() === '') {
		return pendingParagraphAfterCompletedBlock(ctx) ?? _exitToParagraph(ctx, line.start, line.endExclusive);
	}
	// Continue: re-emit the quote markers with a single trailing space.
	const inserted = '\n' + prefix.replace(/\s*$/, ' ');
	return _insertAt(sel, inserted);
}

/**
 * Pending paragraph that replaces a trailing marker-only blockquote line.
 * Smart Enter uses this result for both Enter and no-op Arrow Down, so leaving
 * the quote creates a real editable visual line without changing source until
 * the user types.
 */
function blockQuoteExitPendingParagraph(ctx: CursorCommandContext): PendingParagraphResult | undefined {
	const block = ctx.activeBlock;
	if (!ctx.selection.isCollapsed || block?.kind !== 'blockQuote') { return undefined; }

	const line = _blockQuoteLineAt(ctx.text, ctx.selection.active);
	if (!line.prefix || line.content.slice(line.prefix.length).trim() !== '') { return undefined; }
	if (ctx.selection.active < line.start + line.prefix.length) { return undefined; }

	const blockStart = _blockAbsoluteStart(ctx.document, block);
	if (blockStart === undefined) { return undefined; }
	const blockEnd = blockStart + block.length;
	if (!/^[\r\n]*$/.test(ctx.text.slice(line.endExclusive, blockEnd))) { return undefined; }

	const previousNewline = line.start > blockStart ? ctx.text.lastIndexOf('\n', line.start - 1) : -1;
	const hasPreviousQuotedLine = previousNewline >= blockStart;
	return {
		kind: 'pending',
		anchorBlock: block,
		replaceRange: new OffsetRange(hasPreviousQuotedLine ? previousNewline : blockStart, blockEnd),
		separateFromPreviousBlock: hasPreviousQuotedLine,
		atEof: blockEnd >= ctx.text.length,
	};
}

interface BlockQuoteLine {
	readonly start: number;
	readonly endExclusive: number;
	readonly content: string;
	readonly prefix: string | undefined;
}

/** Source line and quote prefix at `offset`, shared by quote continuation and exit. */
function _blockQuoteLineAt(text: string, offset: number): BlockQuoteLine {
	const start = text.lastIndexOf('\n', offset - 1) + 1;
	const endExclusive = _lineEnd(text, offset);
	const content = text.slice(start, endExclusive);
	return {
		start,
		endExclusive,
		content,
		prefix: /^(\s*(?:>\s*)+)/.exec(content)?.[1],
	};
}

/** List Enter: continue with the next marker; an empty item outdents or exits. */
function _listEnter(ctx: CursorCommandContext): SmartEnterResult {
	const sel = ctx.selection;
	const located = findListItemForCaret(ctx.document, ctx.text, sel.active);
	if (!located) { return _lineBreak(ctx); }
	const { item, list } = located;
	const itemStart = findNodeOffsetById(ctx.document, item);
	if (itemStart === undefined) { return _lineBreak(ctx); }

	if (_isEmptyListItem(ctx, item, itemStart)) {
		const outdented = outdent()(ctx);
		if (outdented) {
			return { kind: 'edit', edit: outdented.edit, selection: outdented.selection };
		}
		// Empty item: drop the marker and exit the list into a paragraph.
		return _exitToParagraph(ctx, itemStart, itemStart + item.length);
	}
	const inserted = '\n' + _continuationMarker(ctx, list, item);
	return _insertAt(sel, inserted);
}

/**
 * Replace the line spanning `[lineStart, lineEnd)` (a marker-only quote line or
 * list item) and its preceding newline with a paragraph break, so the caret
 * leaves the construct and lands on a fresh blank line.
 */
function _exitToParagraph(ctx: CursorCommandContext, lineStart: number, lineEnd: number): SmartEnterResult {
	const prevNewline = lineStart > 0 ? ctx.text.lastIndexOf('\n', lineStart - 1) : -1;
	if (prevNewline >= 0) {
		return {
			kind: 'edit',
			edit: StringEdit.replace(new OffsetRange(prevNewline, lineEnd), '\n\n'),
			selection: Selection.collapsed(prevNewline + 2),
		};
	}
	// No preceding line: the construct is the whole document; just drop it.
	return {
		kind: 'edit',
		edit: StringEdit.replace(new OffsetRange(lineStart, lineEnd), ''),
		selection: Selection.collapsed(lineStart),
	};
}

/** The marker that continues `item` on the next line of `list`. */
function _continuationMarker(ctx: CursorCommandContext, list: ListAstNode, item: ListItemAstNode): string {
	const markerStart = findNodeOffsetById(ctx.document, item.marker);
	const prefix = markerStart === undefined
		? ''
		: ctx.text.slice(lineStart(ctx.text, markerStart), markerStart);
	const marker = item.marker.content.trim();
	let nextMarker = `${marker.charAt(0) || '-'} `;
	if (list.ordered) {
		const ordered = /^(\d+)([.)])/.exec(marker);
		if (ordered) {
			nextMarker = `${Number(ordered[1]) + 1}${ordered[2]} `;
		}
	}
	return `${prefix}${nextMarker}${item.checked !== undefined ? '[ ] ' : ''}`;
}

/** Whether the item contains only its structural marker or an empty GFM checkbox. */
function _isEmptyListItem(ctx: CursorCommandContext, item: ListItemAstNode, itemStart: number): boolean {
	const markerStart = findNodeOffsetById(ctx.document, item.marker);
	if (markerStart === undefined) { return false; }
	const itemBody = ctx.text.slice(
		markerStart + item.marker.length,
		itemStart + item.length,
	);
	return itemBody.trim().length === 0 || /^\[[ xX]\](?=[ \t\r\n])[ \t\r\n]*$/.test(itemBody);
}

/** A collapsed insertion at the cursor, advancing the caret past it. */
function _insertAt(sel: CursorCommandContext['selection'], inserted: string): SmartEnterResult {
	return {
		kind: 'edit',
		edit: StringEdit.replace(sel.range, inserted),
		selection: Selection.collapsed(sel.range.start + inserted.length),
	};
}

/** End offset of the line containing `offset` (the next `\n`, or end of text). */
function _lineEnd(text: string, offset: number): number {
	const nl = text.indexOf('\n', offset);
	return nl === -1 ? text.length : nl;
}

function lineStart(text: string, offset: number): number {
	return text.lastIndexOf('\n', Math.max(0, offset - 1)) + 1;
}

function lineEnd(text: string, offset: number): number {
	const newline = text.indexOf('\n', offset);
	return newline === -1 ? text.length : newline;
}

function selectedLineStarts(text: string, range: OffsetRange): number[] {
	const starts = [lineStart(text, range.start)];
	const lastSelectedOffset = range.endExclusive > range.start && text[range.endExclusive - 1] === '\n'
		? range.endExclusive - 1
		: range.endExclusive;
	let next = text.indexOf('\n', starts[0]) + 1;
	while (next > 0 && next <= lastSelectedOffset) {
		starts.push(next);
		next = text.indexOf('\n', next) + 1;
	}
	return starts;
}

/** Whitespace needed to advance `linePrefix` to its next configured tab stop. */
export function tabTextForLinePrefix(
	linePrefix: string,
	config: IndentationConfig = DEFAULT_INDENTATION_CONFIG,
): string {
	validateIndentationConfig(config);
	if (!config.insertSpaces) { return '\t'; }
	const column = visibleColumn(linePrefix, config.tabSize);
	return ' '.repeat(config.tabSize - (column % config.tabSize));
}

function indentationUnit(config: IndentationConfig): string {
	return config.insertSpaces ? ' '.repeat(config.tabSize) : '\t';
}

/** Remove one configured tab stop from a run of leading spaces and tabs. */
export function outdentWhitespace(
	text: string,
	config: IndentationConfig = DEFAULT_INDENTATION_CONFIG,
): string {
	validateIndentationConfig(config);
	const currentWidth = visibleColumn(text, config.tabSize);
	if (currentWidth === 0) { return text; }
	const targetWidth = currentWidth - (currentWidth % config.tabSize || config.tabSize);
	return indentationForWidth(targetWidth, config);
}

function indentationForWidth(width: number, config: IndentationConfig): string {
	if (config.insertSpaces) { return ' '.repeat(width); }
	return '\t'.repeat(Math.floor(width / config.tabSize)) + ' '.repeat(width % config.tabSize);
}

function visibleColumn(text: string, tabSize: number): number {
	let column = 0;
	for (const char of text) {
		column = char === '\t'
			? column + tabSize - (column % tabSize)
			: column + 1;
	}
	return column;
}

function leadingWhitespaceEnd(text: string, start: number): number {
	let end = start;
	while (text[end] === ' ' || text[end] === '\t') { end++; }
	return end;
}

interface LocatedListItem {
	readonly list: ListAstNode;
	readonly item: ListItemAstNode;
	readonly index: number;
}

function findListItemForCaret(document: DocumentAstNode, text: string, offset: number): LocatedListItem | undefined {
	const visit = (
		node: AstNode,
		start: number,
		containingList: ListAstNode | undefined,
		itemIndex: number | undefined,
	): LocatedListItem | undefined => {
		const current = node instanceof ListItemAstNode && containingList !== undefined && itemIndex !== undefined
			? { list: containingList, item: node, index: itemIndex }
			: undefined;
		let childStart = start;
		let boundaryFallback: LocatedListItem | undefined;
		for (const child of node.children) {
			const childEnd = childStart + child.length;
			const childList = node instanceof ListAstNode && child instanceof ListItemAstNode ? node : containingList;
			const childItemIndex = node instanceof ListAstNode && child instanceof ListItemAstNode
				? node.items.indexOf(child)
				: itemIndex;
			if (childStart <= offset && offset < childEnd) {
				return visit(child, childStart, childList, childItemIndex) ?? current;
			}
			if (childEnd === offset) {
				boundaryFallback = visit(child, childStart, childList, childItemIndex) ?? current;
			}
			childStart = childEnd;
		}
		return boundaryFallback ?? current;
	};
	const containingItem = visit(document, 0, undefined, undefined);
	if (containingItem) {
		const markerOffset = findNodeOffsetById(document, containingItem.item.marker);
		if (markerOffset !== undefined && lineStart(text, markerOffset) === lineStart(text, offset)) {
			return containingItem;
		}
	}

	let itemOnLine: LocatedListItem | undefined;
	const findOnLine = (node: AstNode): void => {
		if (node instanceof ListAstNode) {
			for (let index = 0; index < node.items.length; index++) {
				const item = node.items[index];
				const markerOffset = findNodeOffsetById(document, item.marker);
				if (markerOffset !== undefined && lineStart(text, markerOffset) === lineStart(text, offset)) {
					itemOnLine = { list: node, item, index };
				}
			}
		}
		for (const child of node.children) { findOnLine(child); }
	};
	findOnLine(document);
	return itemOnLine ?? containingItem;
}

function listItemLineContentStarts(
	text: string,
	itemStart: number,
	itemEnd: number,
	enclosingBlockQuoteDepth: number,
): number[] {
	const starts: number[] = [];
	let start = lineStart(text, itemStart);
	while (start < itemEnd) {
		starts.push(offsetAfterBlockQuotePrefixes(text, start, enclosingBlockQuoteDepth));
		const newline = text.indexOf('\n', start);
		if (newline === -1) { break; }
		start = newline + 1;
	}
	return starts;
}

function blockQuotePrefixDepth(text: string, lineOffset: number, endOffset: number): number {
	let offset = lineOffset;
	let depth = 0;
	while (offset < endOffset) {
		let markerOffset = offset;
		for (
			let count = 0;
			count < 3 && markerOffset < endOffset && (text[markerOffset] === ' ' || text[markerOffset] === '\t');
			count++
		) {
			markerOffset++;
		}
		if (markerOffset >= endOffset || text[markerOffset] !== '>') { break; }
		depth++;
		offset = markerOffset + 1;
		if (text[offset] === ' ' || text[offset] === '\t') { offset++; }
	}
	return depth;
}

function offsetAfterBlockQuotePrefixes(text: string, lineOffset: number, depth: number): number {
	let offset = lineOffset;
	for (let index = 0; index < depth; index++) {
		let markerOffset = offset;
		for (let count = 0; count < 3 && (text[markerOffset] === ' ' || text[markerOffset] === '\t'); count++) {
			markerOffset++;
		}
		if (text[markerOffset] !== '>') { return lineOffset; }
		offset = markerOffset + 1;
		if (text[offset] === ' ' || text[offset] === '\t') { offset++; }
	}
	return offset;
}

function mapSelection(edit: StringEdit, selection: Selection): Selection {
	return new Selection(edit.mapOffset(selection.anchor), edit.mapOffset(selection.active));
}

function mapLineIndentSelection(edit: StringEdit, selection: Selection, lineStarts: ReadonlySet<number>): Selection {
	const mapOffset = (offset: number): number => {
		if (!lineStarts.has(offset)) { return edit.mapOffset(offset); }
		let delta = 0;
		for (const replacement of edit.replacements) {
			if (replacement.replaceRange.start >= offset) { break; }
			delta += replacement.newText.length - replacement.replaceRange.length;
		}
		return offset + delta;
	};
	return new Selection(mapOffset(selection.anchor), mapOffset(selection.active));
}

function validateIndentationConfig(config: IndentationConfig): void {
	if (!Number.isInteger(config.tabSize) || config.tabSize <= 0) {
		throw new RangeError(`tabSize must be a positive integer, got ${config.tabSize}`);
	}
}

function _lineBreak(ctx: CursorCommandContext): SmartEnterResult {
	const result = insertLineBreak(ctx)!;
	return { kind: 'edit', edit: result.edit, selection: result.selection };
}

/** Absolute start offset of `block` within `doc`, or `undefined` if absent. */
function _blockAbsoluteStart(doc: DocumentAstNode, block: BlockAstNode): number | undefined {
	let pos = 0;
	for (const child of doc.children) {
		if (child === block) { return pos; }
		pos += child.length;
	}
	return undefined;
}

/** Combined length of the block's trailing glue (its inter-block gap newlines). */
function _trailingGlueLength(block: BlockAstNode): number {
	const content = block.children;
	let len = 0;
	for (let i = content.length - 1; i >= 0; i--) {
		if (content[i] instanceof GlueAstNode) { len += content[i].length; } else { break; }
	}
	return len;
}
