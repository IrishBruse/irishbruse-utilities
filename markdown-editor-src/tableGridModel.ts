/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import {
	EditorModel,
	OffsetRange,
	StringEdit,
	StringReplacement,
	findBlockAtOffset,
	findNodeOffsetById,
	type DocumentAstNode,
	type TableAstNode,
	type TableCellAstNode,
} from '@vscode/markdown-editor';

export type TableAlignment = 'left' | 'center' | 'right';

export interface ParsedTable {
	readonly rows: string[][];
	readonly alignments: TableAlignment[];
}

/**
 * Cell AST spans include leading/trailing `|` glue. Return only the cell body
 * (inline markdown), trimmed — never the pipe characters.
 */
export function getCellText(cell: TableCellAstNode, doc: DocumentAstNode, source: string): string {
	let text = '';
	for (const child of cell.children) {
		if (child.kind === 'glue' && (child as { glueKind?: string }).glueKind === 'tableCellGlue') {
			continue;
		}
		if (child.kind === 'marker') {
			const markerKind = (child as { markerKind?: string }).markerKind;
			if (markerKind === 'tableDelimiter' || markerKind === 'tableDelimiterClose') {
				continue;
			}
		}
		const childOffset = findNodeOffsetById(doc, child);
		if (childOffset === undefined) {
			continue;
		}
		text += source.slice(childOffset, childOffset + child.length);
	}
	if (text.length === 0) {
		const offset = findNodeOffsetById(doc, cell);
		if (offset === undefined) {
			return '';
		}
		text = source.slice(offset, offset + cell.length);
	}
	return text.replace(/^\s*\|?\s*/, '').replace(/\s*\|?\s*$/, '').trim();
}

export function parseAlignment(delimiterText: string): TableAlignment {
	const trimmed = delimiterText.trim();
	const left = trimmed.startsWith(':');
	const right = trimmed.endsWith(':');
	if (left && right) {
		return 'center';
	}
	if (right) {
		return 'right';
	}
	return 'left';
}

export function parseTable(table: TableAstNode, doc: DocumentAstNode, source: string): ParsedTable {
	const rows: string[][] = [];
	const alignments: TableAlignment[] = [];

	if (table.headerRow) {
		rows.push(table.headerRow.cells.map(cell => getCellText(cell, doc, source)));
	}

	if (table.delimiterRow) {
		for (const cell of table.delimiterRow.cells) {
			alignments.push(parseAlignment(getCellText(cell, doc, source)));
		}
	}

	for (const bodyRow of table.bodyRows) {
		rows.push(bodyRow.cells.map(cell => getCellText(cell, doc, source)));
	}

	const colCount = Math.max(alignments.length, ...rows.map(row => row.length), 1);
	for (const row of rows) {
		while (row.length < colCount) {
			row.push('');
		}
	}
	while (alignments.length < colCount) {
		alignments.push('left');
	}

	return { rows, alignments };
}

export function getTableSourceRange(table: TableAstNode, doc: DocumentAstNode): OffsetRange | undefined {
	const start = findNodeOffsetById(doc, table);
	if (start === undefined) {
		return undefined;
	}
	return OffsetRange.fromTo(start, start + table.length);
}

function escapeCell(text: string): string {
	return text.replace(/\|/g, '\\|').replace(/\r?\n/g, ' ');
}

function formatDelimiterCell(alignment: TableAlignment): string {
	switch (alignment) {
		case 'center':
			return ':---:';
		case 'right':
			return '---:';
		default:
			return '---';
	}
}

function formatRow(cells: readonly string[], colCount: number): string {
	const padded = [...cells];
	while (padded.length < colCount) {
		padded.push('');
	}
	return `| ${padded.map(escapeCell).join(' | ')} |`;
}

export function serializeTable(rows: readonly (readonly string[])[], alignments: readonly TableAlignment[]): string {
	if (rows.length === 0) {
		return '|  | |\n| --- | |\n|  | |';
	}

	const colCount = Math.max(
		alignments.length,
		...rows.map(row => row.length),
		1,
	);
	const paddedAlignments = [...alignments];
	while (paddedAlignments.length < colCount) {
		paddedAlignments.push('left');
	}

	const lines = [
		formatRow(rows[0] ?? [], colCount),
		`| ${paddedAlignments.map(formatDelimiterCell).join(' | ')} |`,
	];
	for (let i = 1; i < rows.length; i++) {
		lines.push(formatRow(rows[i] ?? [], colCount));
	}
	return lines.join('\n');
}

export function applyTableData(
	model: EditorModel,
	table: TableAstNode,
	rows: readonly (readonly string[])[],
	alignments: readonly TableAlignment[],
): void {
	const doc = model.document.get();
	const range = getTableSourceRange(table, doc);
	if (!range) {
		return;
	}
	const newText = serializeTable(rows, alignments);
	model.applyEdit(new StringEdit([StringReplacement.replace(range, newText)]));
}

export function findTableAtOffset(doc: DocumentAstNode, offset: number): TableAstNode | undefined {
	const block = findBlockAtOffset(doc, offset);
	return block?.kind === 'table' ? block : undefined;
}
