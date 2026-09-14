import {
	EditorModel,
	OffsetRange,
	StringEdit,
	findBlockAtOffset,
	findNodeOffsetById,
	type DocumentAstNode,
	type TableAstNode,
} from '../core/index';

export type TableAlignment = 'left' | 'center' | 'right';

export interface ParsedTable {
	readonly rows: string[][];
	readonly alignments: TableAlignment[];
}

function splitRow(line: string): string[] {
	let body = line.trim();
	if (body.startsWith('|')) {
		body = body.slice(1);
	}
	if (body.endsWith('|')) {
		body = body.slice(0, -1);
	}
	const cells: string[] = [];
	let current = '';
	let escaped = false;
	for (const ch of body) {
		if (escaped) {
			current += ch;
			escaped = false;
			continue;
		}
		if (ch === '\\') {
			escaped = true;
			current += ch;
			continue;
		}
		if (ch === '|') {
			cells.push(current.replace(/^\s+|\s+$/g, ''));
			current = '';
			continue;
		}
		current += ch;
	}
	cells.push(current.replace(/^\s+|\s+$/g, ''));
	return cells;
}

function isDelimiterRow(cells: readonly string[]): boolean {
	return cells.length > 0 && cells.every(cell => /^:?-{3,}:?$/.test(cell.replace(/\s+/g, '')));
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

export function parseTableSource(source: string): ParsedTable {
	const lines = source.replace(/\r\n/g, '\n').replace(/\n+$/, '').split('\n').filter(line => line.trim().length > 0);
	const parsedRows: string[][] = [];
	let alignments: TableAlignment[] = [];
	for (const line of lines) {
		const cells = splitRow(line);
		if (isDelimiterRow(cells)) {
			alignments = cells.map(parseAlignment);
			continue;
		}
		parsedRows.push(cells);
	}
	const colCount = Math.max(alignments.length, ...parsedRows.map(row => row.length), 1);
	for (const row of parsedRows) {
		while (row.length < colCount) {
			row.push('');
		}
	}
	while (alignments.length < colCount) {
		alignments.push('left');
	}
	return { rows: parsedRows, alignments };
}

export function parseTable(table: TableAstNode, _doc: DocumentAstNode, source: string): ParsedTable {
	return parseTableSource(source.slice(table.start, table.end));
}

export function getTableSourceRange(table: TableAstNode, _doc: DocumentAstNode): OffsetRange | undefined {
	return OffsetRange.fromTo(table.start, table.end);
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

export function insertRow(rows: readonly (readonly string[])[], index: number): string[][] {
	const colCount = Math.max(1, rows[0]?.length ?? 1);
	const next = rows.map(row => [...row]);
	const at = Math.max(0, Math.min(index, next.length));
	next.splice(at, 0, Array.from({ length: colCount }, () => ''));
	return next;
}

export function insertColumn(
	rows: readonly (readonly string[])[],
	alignments: readonly TableAlignment[],
	index: number,
): { rows: string[][]; alignments: TableAlignment[] } {
	const colCount = Math.max(alignments.length, ...rows.map(row => row.length), 0);
	const at = Math.max(0, Math.min(index, colCount));
	return {
		rows: rows.map(row => {
			const copy = [...row];
			while (copy.length < colCount) {
				copy.push('');
			}
			copy.splice(at, 0, '');
			return copy;
		}),
		alignments: [...alignments.slice(0, at), 'left', ...alignments.slice(at)],
	};
}

export function deleteRow(rows: readonly (readonly string[])[], index: number): string[][] {
	if (rows.length <= 1) {
		return rows.map(row => [...row]);
	}
	const at = Math.max(0, Math.min(index, rows.length - 1));
	return rows.filter((_, i) => i !== at).map(row => [...row]);
}

export function deleteColumn(
	rows: readonly (readonly string[])[],
	alignments: readonly TableAlignment[],
	index: number,
): { rows: string[][]; alignments: TableAlignment[] } {
	const colCount = Math.max(alignments.length, ...rows.map(row => row.length), 0);
	if (colCount <= 1) {
		return {
			rows: rows.map(row => [...row]),
			alignments: [...alignments],
		};
	}
	const at = Math.max(0, Math.min(index, colCount - 1));
	return {
		rows: rows.map(row => {
			const copy = [...row];
			while (copy.length < colCount) {
				copy.push('');
			}
			copy.splice(at, 1);
			return copy;
		}),
		alignments: alignments.filter((_, i) => i !== at),
	};
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
	const source = model.sourceText.get().value;
	const original = source.slice(range.start, range.endExclusive);
	const trailingNewlines = original.match(/\r?\n*$/)?.[0] ?? '';
	const newText = serializeTable(rows, alignments) + (trailingNewlines || '\n');
	model.applyEdit(StringEdit.replace(range, newText));
}

export function findTableAtOffset(doc: DocumentAstNode, offset: number): TableAstNode | undefined {
	const block = findBlockAtOffset(doc, offset);
	return block?.kind === 'table' ? block as TableAstNode : undefined;
}

export { findNodeOffsetById };
