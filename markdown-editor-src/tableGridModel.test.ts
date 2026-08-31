import { EditorModel, StringValue, type TableAstNode } from '@vscode/markdown-editor';
import { describe, expect, it } from 'vitest';
import {
	applyTableData,
	insertColumn,
	parseTable,
	serializeTable,
	type TableAlignment,
} from './tableGridModel';

function findTable(node: { kind: string; children?: readonly unknown[] }): TableAstNode | undefined {
	if (node.kind === 'table') {
		return node as TableAstNode;
	}
	for (const child of node.children ?? []) {
		const found = findTable(child as { kind: string; children?: readonly unknown[] });
		if (found) {
			return found;
		}
	}
	return undefined;
}

describe('tableGridModel', () => {
	it('serializeTable does not end with a newline', () => {
		const text = serializeTable([['A', 'B'], ['1', '2']], ['left', 'left']);
		expect(text.endsWith('\n')).toBe(false);
	});

	it('insertColumn pads every row at the insert index', () => {
		const rows = [['A', 'B'], ['1', '2']];
		const alignments: TableAlignment[] = ['left', 'right'];
		const inserted = insertColumn(rows, alignments, 1);
		expect(inserted.rows).toEqual([['A', '', 'B'], ['1', '', '2']]);
		expect(inserted.alignments).toEqual(['left', 'left', 'right']);
	});

	it('applyTableData keeps blank lines after the table so the next heading stays separate', () => {
		const source = `## Runtime map

| Path | Runtime object |
| --- | --- |
| \`src/a\` | \`api\` |

## Runtime shape vs export namespace

More text.
`;
		const model = new EditorModel();
		model.sourceText.set(new StringValue(source), undefined);
		const doc = model.document.get();
		const table = findTable(doc);
		expect(table).toBeTruthy();
		if (!table) {
			return;
		}

		const parsed = parseTable(table, doc, source);
		const inserted = insertColumn(parsed.rows, parsed.alignments, 1);
		applyTableData(model, table, inserted.rows, inserted.alignments);

		const after = model.sourceText.get().value;
		expect(after).not.toContain('|##');
		expect(after).toContain('| Path |  | Runtime object |');
		expect(after).toContain('\n\n## Runtime shape vs export namespace\n');
	});
});
