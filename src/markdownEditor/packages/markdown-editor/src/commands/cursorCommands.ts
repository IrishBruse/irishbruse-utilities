import { findWordBoundaryLeft, findWordBoundaryRight } from '../core/wordUtils.js';
import { CursorPosition, type VirtualCursorLine } from '../core/cursorPosition.js';
import { nextCursorPosition, normalizeCursorPosition } from '../model/cursorNavigation.js';
import type { CursorCommand, VisualCursorCommand } from './types.js';

export const cursorRight: CursorCommand = (ctx) => {
	if (ctx.cursorPosition.kind === 'virtual') {
		return sourceBoundary(ctx, ctx.cursorPosition.line, 'after', 'right');
	}
	if (!ctx.selection.isCollapsed) {
		return CursorPosition.source(ctx.selection.range.endExclusive);
	}
	return CursorPosition.source(nextCursorPosition(
		ctx.document,
		ctx.markerVisibleBlocks,
		ctx.selection.active,
		'right',
		ctx.selection.range,
	));
};

export const cursorLeft: CursorCommand = (ctx) => {
	if (ctx.cursorPosition.kind === 'virtual') {
		return sourceBoundary(ctx, ctx.cursorPosition.line, 'before', 'left');
	}
	if (!ctx.selection.isCollapsed) {
		return CursorPosition.source(ctx.selection.range.start);
	}
	return CursorPosition.source(nextCursorPosition(
		ctx.document,
		ctx.markerVisibleBlocks,
		ctx.selection.active,
		'left',
		ctx.selection.range,
	));
};

export const cursorMoveRight: CursorCommand = (ctx) => {
	if (ctx.cursorPosition.kind === 'virtual') {
		return sourceBoundary(ctx, ctx.cursorPosition.line, 'after', 'right');
	}
	return CursorPosition.source(nextCursorPosition(
		ctx.document,
		ctx.markerVisibleBlocks,
		ctx.selection.active,
		'right',
		ctx.selection.range,
	));
};

export const cursorMoveLeft: CursorCommand = (ctx) => {
	if (ctx.cursorPosition.kind === 'virtual') {
		return sourceBoundary(ctx, ctx.cursorPosition.line, 'before', 'left');
	}
	return CursorPosition.source(nextCursorPosition(
		ctx.document,
		ctx.markerVisibleBlocks,
		ctx.selection.active,
		'left',
		ctx.selection.range,
	));
};

export const cursorWordRight: CursorCommand = (ctx) => {
	const start = ctx.cursorPosition.kind === 'virtual'
		? ctx.cursorPosition.line.sourceOffsetAfter
		: ctx.selection.active;
	return CursorPosition.source(normalizeCursorPosition(
		ctx.document,
		ctx.markerVisibleBlocks,
		ctx.selection.active,
		findWordBoundaryRight(ctx.text, start, ctx.wordNavigationConfig),
		'right',
		false,
		ctx.selection.range,
	));
};

export const cursorWordLeft: CursorCommand = (ctx) => {
	const start = ctx.cursorPosition.kind === 'virtual'
		? ctx.cursorPosition.line.sourceOffsetBefore
		: ctx.selection.active;
	return CursorPosition.source(normalizeCursorPosition(
		ctx.document,
		ctx.markerVisibleBlocks,
		ctx.selection.active,
		findWordBoundaryLeft(ctx.text, start, ctx.wordNavigationConfig),
		'left',
		false,
		ctx.selection.range,
	));
};

export const cursorLineStart: CursorCommand = (ctx) => {
	if (ctx.cursorPosition.kind === 'virtual') {
		return ctx.cursorPosition;
	}
	return CursorPosition.source(normalizeCursorPosition(
		ctx.document,
		ctx.markerVisibleBlocks,
		ctx.selection.active,
		ctx.selection.active === 0 ? 0 : ctx.text.lastIndexOf('\n', ctx.selection.active - 1) + 1,
		'right',
		true,
		ctx.selection.range,
	));
};

export const cursorLineEnd: CursorCommand = (ctx) => {
	if (ctx.cursorPosition.kind === 'virtual') {
		return ctx.cursorPosition;
	}
	const idx = ctx.text.indexOf('\n', ctx.selection.active);
	return CursorPosition.source(normalizeCursorPosition(
		ctx.document,
		ctx.markerVisibleBlocks,
		ctx.selection.active,
		idx === -1 ? ctx.text.length : idx,
		'left',
		true,
		ctx.selection.range,
	));
};

export const cursorDocumentStart: CursorCommand = (ctx) => CursorPosition.source(normalizeCursorPosition(
	ctx.document,
	ctx.markerVisibleBlocks,
	ctx.selection.active,
	0,
	'right',
	true,
	ctx.selection.range,
));

export const cursorDocumentEnd: CursorCommand = (ctx) => CursorPosition.source(normalizeCursorPosition(
	ctx.document,
	ctx.markerVisibleBlocks,
	ctx.selection.active,
	ctx.text.length,
	'left',
	true,
	ctx.selection.range,
));

export const cursorVisualLineStart: VisualCursorCommand = (ctx) => {
	if (ctx.cursorPosition.kind === 'virtual') {
		return { position: ctx.cursorPosition, desiredColumn: undefined };
	}
	const lineIndex = ctx.lineMap.lineIndexOfPosition(ctx.cursorPosition);
	if (lineIndex === undefined) {
		return { position: cursorLineStart(ctx), desiredColumn: undefined };
	}
	const visualStart = ctx.lineMap.lineStartOffset(lineIndex);
	const visualEnd = ctx.lineMap.lineEndOffset(lineIndex);
	if (visualStart === undefined || visualEnd === undefined) {
		return { position: cursorLineStart(ctx), desiredColumn: undefined };
	}
	const logicalStart = visualStart === 0 ? 0 : ctx.text.lastIndexOf('\n', visualStart - 1) + 1;
	let firstNonWhitespace = visualStart;
	if (visualStart === logicalStart) {
		while (
			firstNonWhitespace < visualEnd
			&& (ctx.text[firstNonWhitespace] === ' ' || ctx.text[firstNonWhitespace] === '\t')
		) {
			firstNonWhitespace++;
		}
		if (firstNonWhitespace === visualEnd) {
			firstNonWhitespace = visualStart;
		}
	}
	const target = firstNonWhitespace !== visualStart && ctx.selection.active !== firstNonWhitespace
		? firstNonWhitespace
		: visualStart;
	return {
		position: CursorPosition.source(normalizeCursorPosition(
			ctx.document,
			ctx.markerVisibleBlocks,
			ctx.selection.active,
			target,
			'right',
			true,
			ctx.selection.range,
		)),
		desiredColumn: undefined,
	};
};

export const cursorVisualLineEnd: VisualCursorCommand = (ctx) => {
	if (ctx.cursorPosition.kind === 'virtual') {
		return { position: ctx.cursorPosition, desiredColumn: undefined };
	}
	const lineIndex = ctx.lineMap.lineIndexOfPosition(ctx.cursorPosition);
	if (lineIndex === undefined) {
		return { position: cursorLineEnd(ctx), desiredColumn: undefined };
	}
	const visualEnd = ctx.lineMap.lineEndOffset(lineIndex);
	if (visualEnd === undefined) {
		return { position: cursorLineEnd(ctx), desiredColumn: undefined };
	}
	return {
		position: CursorPosition.source(normalizeCursorPosition(
			ctx.document,
			ctx.markerVisibleBlocks,
			ctx.selection.active,
			visualEnd,
			'left',
			true,
			ctx.selection.range,
		)),
		desiredColumn: undefined,
	};
};

export const cursorDown: VisualCursorCommand = (ctx) => {
	const lineIdx = ctx.lineMap.lineIndexOfPosition(ctx.cursorPosition);
	if (lineIdx === undefined) {
		return cursorDownFromUnmeasuredVirtualLine(ctx);
	}
	const x = ctx.desiredColumn ?? ctx.lineMap.xAtPosition(ctx.cursorPosition);
	if (lineIdx >= ctx.lineMap.lineCount - 1) {
		return { position: ctx.cursorPosition, desiredColumn: x };
	}
	return { position: ctx.lineMap.positionInLineAtX(lineIdx + 1, x), desiredColumn: x };
};

export const cursorUp: VisualCursorCommand = (ctx) => {
	const lineIdx = ctx.lineMap.lineIndexOfPosition(ctx.cursorPosition);
	if (lineIdx === undefined) {
		return cursorUpFromUnmeasuredVirtualLine(ctx);
	}
	if (ctx.cursorPosition.kind === 'virtual' && lineIdx > 0) {
		return moveToLineEnd(ctx, lineIdx - 1);
	}
	const x = ctx.desiredColumn ?? ctx.lineMap.xAtPosition(ctx.cursorPosition);
	if (lineIdx <= 0) {
		return { position: ctx.cursorPosition, desiredColumn: x };
	}
	return { position: ctx.lineMap.positionInLineAtX(lineIdx - 1, x), desiredColumn: x };
};

function sourceBoundary(
	ctx: Parameters<CursorCommand>[0],
	line: VirtualCursorLine,
	side: 'before' | 'after',
	direction: 'left' | 'right',
): CursorPosition {
	const target = side === 'before' ? line.sourceOffsetBefore : line.sourceOffsetAfter;
	return CursorPosition.source(normalizeCursorPosition(
		ctx.document,
		ctx.markerVisibleBlocks,
		ctx.selection.active,
		target,
		direction,
		true,
		ctx.selection.range,
	));
}

function cursorUpFromUnmeasuredVirtualLine(ctx: Parameters<VisualCursorCommand>[0]) {
	if (ctx.cursorPosition.kind !== 'virtual' || ctx.lineMap.isEmpty) {
		return { position: ctx.cursorPosition, desiredColumn: ctx.desiredColumn };
	}
	const anchorLine = ctx.lineMap.lineIndexOfOffset(ctx.cursorPosition.line.sourceOffsetBefore);
	return moveToLineEnd(ctx, anchorLine);
}

function cursorDownFromUnmeasuredVirtualLine(ctx: Parameters<VisualCursorCommand>[0]) {
	if (ctx.cursorPosition.kind !== 'virtual' || ctx.lineMap.isEmpty) {
		return { position: ctx.cursorPosition, desiredColumn: ctx.desiredColumn };
	}
	const anchorLine = ctx.lineMap.lineIndexOfOffset(ctx.cursorPosition.line.sourceOffsetBefore);
	const x = ctx.desiredColumn ?? ctx.lineMap.lineRect(anchorLine).left;
	if (anchorLine >= ctx.lineMap.lineCount - 1) {
		return { position: ctx.cursorPosition, desiredColumn: x };
	}
	return {
		position: ctx.lineMap.positionInLineAtX(anchorLine + 1, x),
		desiredColumn: x,
	};
}

function moveToLineEnd(ctx: Parameters<VisualCursorCommand>[0], lineIndex: number) {
	const x = ctx.lineMap.lineRect(lineIndex).right;
	return {
		position: ctx.lineMap.positionInLineAtX(lineIndex, x),
		desiredColumn: x,
	};
}
