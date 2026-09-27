import { OffsetRange } from '../core/offsetRange.js';
import { Selection } from '../core/selection.js';
import { StringEdit } from '../core/stringEdit.js';
import type { CursorCommandContext, EditCommand } from './types.js';

interface SelectedLines {
	readonly start: number;
	readonly endExclusive: number;
	readonly text: string;
}

interface JoinedLine {
	readonly originalStart: number;
	readonly contentStart: number;
	readonly contentEndExclusive: number;
	readonly outputStart: number;
	readonly outputEndExclusive: number;
}

export const copyLinesUp: EditCommand = ctx => copyLines(ctx, false);
export const copyLinesDown: EditCommand = ctx => copyLines(ctx, true);
export const moveLinesUp: EditCommand = ctx => moveLines(ctx, false);
export const moveLinesDown: EditCommand = ctx => moveLines(ctx, true);

export const deleteLines: EditCommand = ctx => {
	if (ctx.text.length === 0) {
		return undefined;
	}

	const lines = selectedLines(ctx);
	const activeColumn = ctx.selection.active - lineStart(ctx.text, ctx.selection.active);
	let deleteRange: OffsetRange;
	let targetLineStart: number;
	if (lines.endExclusive < ctx.text.length) {
		deleteRange = new OffsetRange(lines.start, lines.endExclusive + 1);
		targetLineStart = lines.start;
	} else if (lines.start > 0) {
		targetLineStart = lineStart(ctx.text, lines.start - 1);
		deleteRange = new OffsetRange(lines.start - 1, lines.endExclusive);
	} else {
		deleteRange = new OffsetRange(0, ctx.text.length);
		targetLineStart = 0;
	}

	const edit = StringEdit.delete(deleteRange);
	const result = edit.apply(ctx.text);
	const targetLineEnd = lineEnd(result, targetLineStart);
	return {
		edit,
		selection: Selection.collapsed(Math.min(targetLineStart + activeColumn, targetLineEnd)),
	};
};

export const joinLines: EditCommand = ctx => {
	const firstLineStart = lineStart(ctx.text, ctx.selection.range.start);
	const firstLineEnd = lineEnd(ctx.text, firstLineStart);
	if (firstLineEnd === ctx.text.length) {
		return undefined;
	}

	const selected = selectedLines(ctx);
	const lastLineEnd = selected.endExclusive === firstLineEnd
		? lineEnd(ctx.text, firstLineEnd + 1)
		: selected.endExclusive;
	const { text, lines } = joinLineBlock(ctx.text, firstLineStart, lastLineEnd);
	const edit = StringEdit.replace(new OffsetRange(firstLineStart, lastLineEnd), text);
	const selection = ctx.selection.isCollapsed
		? Selection.collapsed(lines[0].outputEndExclusive)
		: new Selection(
			mapJoinedOffset(lines, ctx.selection.anchor),
			mapJoinedOffset(lines, ctx.selection.active),
		);
	return { edit, selection };
};

function copyLines(ctx: CursorCommandContext, down: boolean): ReturnType<EditCommand> {
	const lines = selectedLines(ctx);
	const insertedText = down && lines.endExclusive === ctx.text.length
		? `\n${lines.text}`
		: `${lines.text}\n`;
	const insertOffset = down
		? Math.min(lines.endExclusive + 1, ctx.text.length)
		: lines.start;
	const targetStart = down ? lines.start + lines.text.length + 1 : lines.start;
	const hasTrailingLineBreak = !down || lines.endExclusive < ctx.text.length;
	return {
		edit: StringEdit.insert(insertOffset, insertedText),
		selection: mapSelectionToBlock(
			ctx.selection,
			lines.start,
			targetStart,
			lines.text.length + (hasTrailingLineBreak ? 1 : 0),
		),
	};
}

function moveLines(ctx: CursorCommandContext, down: boolean): ReturnType<EditCommand> {
	const lines = selectedLines(ctx);
	if (down) {
		if (lines.endExclusive === ctx.text.length) {
			return undefined;
		}
		const nextStart = lines.endExclusive + 1;
		const nextEnd = lineEnd(ctx.text, nextStart);
		const nextText = ctx.text.slice(nextStart, nextEnd);
		const targetStart = lines.start + nextText.length + 1;
		return {
			edit: StringEdit.replace(
				new OffsetRange(lines.start, nextEnd),
				`${nextText}\n${lines.text}`,
			),
			selection: mapSelectionToBlock(
				ctx.selection,
				lines.start,
				targetStart,
				lines.text.length + (nextEnd < ctx.text.length ? 1 : 0),
			),
		};
	}

	if (lines.start === 0) {
		return undefined;
	}
	const previousStart = lineStart(ctx.text, lines.start - 1);
	const previousText = ctx.text.slice(previousStart, lines.start - 1);
	return {
		edit: StringEdit.replace(
			new OffsetRange(previousStart, lines.endExclusive),
			`${lines.text}\n${previousText}`,
		),
		selection: mapSelectionToBlock(
			ctx.selection,
			lines.start,
			previousStart,
			lines.text.length + 1,
		),
	};
}

function selectedLines(ctx: CursorCommandContext): SelectedLines {
	const range = ctx.selection.range;
	const start = lineStart(ctx.text, range.start);
	const endOffset = !ctx.selection.isCollapsed
		&& range.endExclusive > start
		&& lineStart(ctx.text, range.endExclusive) === range.endExclusive
		? range.endExclusive - 1
		: range.endExclusive;
	const endExclusive = lineEnd(ctx.text, endOffset);
	return {
		start,
		endExclusive,
		text: ctx.text.slice(start, endExclusive),
	};
}

function mapSelectionToBlock(
	selection: Selection,
	sourceStart: number,
	targetStart: number,
	targetLength: number,
): Selection {
	const mapOffset = (offset: number): number =>
		targetStart + Math.min(offset - sourceStart, targetLength);
	return new Selection(mapOffset(selection.anchor), mapOffset(selection.active));
}

function joinLineBlock(
	source: string,
	start: number,
	endExclusive: number,
): { readonly text: string; readonly lines: readonly JoinedLine[] } {
	const originalLines: { readonly start: number; readonly endExclusive: number }[] = [];
	let lineStartOffset = start;
	while (lineStartOffset <= endExclusive) {
		const lineEndOffset = Math.min(lineEnd(source, lineStartOffset), endExclusive);
		originalLines.push({ start: lineStartOffset, endExclusive: lineEndOffset });
		if (lineEndOffset === endExclusive) {
			break;
		}
		lineStartOffset = lineEndOffset + 1;
	}

	let joined = '';
	const lines: JoinedLine[] = [];
	for (let i = 0; i < originalLines.length; i++) {
		const line = originalLines[i];
		const isFirst = i === 0;
		const isLast = i === originalLines.length - 1;
		const raw = source.slice(line.start, line.endExclusive);
		const leadingLength = isFirst ? 0 : raw.length - raw.trimStart().length;
		const trailingLength = isLast ? 0 : raw.length - raw.trimEnd().length;
		const contentStart = line.start + leadingLength;
		const contentEndExclusive = Math.max(contentStart, line.endExclusive - trailingLength);
		const content = source.slice(contentStart, contentEndExclusive);
		const separator = joined.length > 0 && content.length > 0 ? ' ' : '';
		joined += separator;
		const outputStart = start + joined.length;
		joined += content;
		lines.push({
			originalStart: line.start,
			contentStart,
			contentEndExclusive,
			outputStart,
			outputEndExclusive: start + joined.length,
		});
	}
	return { text: joined, lines };
}

function mapJoinedOffset(lines: readonly JoinedLine[], offset: number): number {
	let line = lines[0];
	for (let i = lines.length - 1; i >= 0; i--) {
		if (lines[i].originalStart <= offset) {
			line = lines[i];
			break;
		}
	}
	if (offset <= line.contentStart) {
		return line.outputStart;
	}
	if (offset >= line.contentEndExclusive) {
		return line.outputEndExclusive;
	}
	return line.outputStart + offset - line.contentStart;
}

function lineStart(text: string, offset: number): number {
	return text.lastIndexOf('\n', Math.max(0, offset - 1)) + 1;
}

function lineEnd(text: string, offset: number): number {
	const newline = text.indexOf('\n', offset);
	return newline === -1 ? text.length : newline;
}
