/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import {
	BlockViewNode,
	EditorModel,
	EditorView,
	blocksIntersecting,
	findBlockAtOffset,
	findNodeOffsetById,
	type BlockMeasurement,
	type TableAstNode,
} from '@vscode/markdown-editor';
import { Disposable, autorun } from '@vscode/observables';
import {
	applyTableData,
	parseTable,
	type TableAlignment,
} from './tableGridModel';

export interface TableGridOptions {
	readonly maxColumnWidth: number;
	readonly style: 'wrapped' | 'compact';
}

/**
 * Confluence-style table editing: keep the native preview table looking like
 * idle/preview mode, and overlay a single textarea on the focused cell only.
 */
export class TableGridController extends Disposable {
	readonly #model: EditorModel;
	readonly #view: EditorView;
	readonly #host: HTMLElement;
	readonly #options: TableGridOptions;
	#activeTableOffset: number | undefined;
	#chromeHost: HTMLElement | undefined;
	#cellEditor: HTMLTextAreaElement | undefined;
	#nativeTable: HTMLTableElement | undefined;
	#hiddenNativeCell: HTMLElement | undefined;
	#rows: string[][] = [];
	#alignments: TableAlignment[] = [];
	#focusedCell: { row: number; col: number } | undefined;
	#dirty = false;
	#isRemounting = false;
	#editContextSuspend: { dispose(): void } | undefined;
	#resizeObserver: ResizeObserver | undefined;

	constructor(model: EditorModel, view: EditorView, host: HTMLElement, options: TableGridOptions) {
		super();
		this.#model = model;
		this.#view = view;
		this.#host = host;
		this.#options = options;

		this.#view.element.addEventListener('pointerdown', this.#onPointerDown, true);
		this._register({ dispose: () => this.#view.element.removeEventListener('pointerdown', this.#onPointerDown, true) });

		this.#host.addEventListener('scroll', this.#onScroll, { passive: true });
		this._register({ dispose: () => this.#host.removeEventListener('scroll', this.#onScroll) });
		this._register({ dispose: () => this.#exitGrid() });

		this._register(autorun((reader) => {
			if (this.#model.readonlyMode.get()) {
				if (this.#activeTableOffset !== undefined) {
					this.#exitGrid();
				}
				return;
			}
			const selection = reader.readObservable(this.#model.selection);
			const doc = reader.readObservable(this.#model.document);
			if (!selection) {
				return;
			}
			const intersecting = blocksIntersecting(doc, selection.range.start, selection.range.endExclusive);
			const tableBlock = intersecting.find(block => block.kind === 'table');
			if (tableBlock) {
				this.#model.activeBlocksOverride.set([], undefined);
				return;
			}
			if (this.#activeTableOffset === undefined) {
				this.#model.activeBlocksOverride.set(undefined, undefined);
			}
		}));
		this._register(autorun((reader) => {
			reader.readObservable(this.#model.sourceText);
			if (this.#activeTableOffset === undefined || this.#isRemounting) {
				return;
			}
			if (!this.#getActiveTable()) {
				this.#exitGrid();
			}
		}));
	}

	#onPointerDown = (event: PointerEvent): void => {
		if (event.button !== 0 || this.#model.readonlyMode.get()) {
			return;
		}
		const target = event.target;
		if (!(target instanceof Element)) {
			return;
		}
		if (target.closest('.ib-table-grid-add-row')) {
			event.preventDefault();
			event.stopPropagation();
			this.#addRow();
			return;
		}
		if (target.closest('.ib-table-grid-add-col')) {
			event.preventDefault();
			event.stopPropagation();
			this.#addColumn();
			return;
		}
		if (target.closest('.ib-table-grid-cell-editor')) {
			event.stopPropagation();
			return;
		}

		const wrapper = target.closest('.md-table-wrapper');
		if (wrapper instanceof HTMLElement) {
			event.preventDefault();
			event.stopPropagation();
			const table = this.#findTableForWrapper(wrapper);
			if (!table) {
				return;
			}
			const offset = findNodeOffsetById(this.#model.document.get(), table);
			if (offset === undefined) {
				return;
			}
			const cell = this.#hitTestCell(event.clientX, event.clientY)
				?? this.#findNativeClickedCell(target, wrapper)
				?? { row: 0, col: 0 };
			this.#enterGrid(offset, cell);
			return;
		}

		if (this.#activeTableOffset !== undefined) {
			this.#commitIfDirty();
			this.#exitGrid();
		}
	};

	#onScroll = (): void => {
		this.#syncCellEditorLayout();
	};

	#findTableForWrapper(wrapper: HTMLElement): TableAstNode | undefined {
		const measurements = this.#view.measuredLayout.measurements.get();
		for (const measurement of measurements) {
			if (measurement.block.kind !== 'table') {
				continue;
			}
			const element = this.#getWrapperElement(measurement);
			if (element === wrapper) {
				return measurement.block;
			}
		}
		return undefined;
	}

	#getWrapperElement(measurement: BlockMeasurement): HTMLElement | undefined {
		const viewNode = measurement.viewNode;
		if (!(viewNode instanceof BlockViewNode)) {
			return undefined;
		}
		return viewNode.scrollElement ?? viewNode.element;
	}

	#hitTestCell(clientX: number, clientY: number): { row: number; col: number } | undefined {
		const table = this.#nativeTable ?? this.#closestTableFromPoint(clientX, clientY);
		if (!table) {
			return undefined;
		}
		let gridRow = 0;
		for (let i = 0; i < table.rows.length; i++) {
			const nativeRow = table.rows[i];
			if (!nativeRow || nativeRow.classList.contains('md-table-delimiter-row')) {
				continue;
			}
			for (let col = 0; col < nativeRow.cells.length; col++) {
				const cell = nativeRow.cells[col];
				const rect = cell.getBoundingClientRect();
				if (clientX >= rect.left && clientX < rect.right && clientY >= rect.top && clientY < rect.bottom) {
					return { row: gridRow, col };
				}
			}
			gridRow++;
		}
		return undefined;
	}

	#closestTableFromPoint(clientX: number, clientY: number): HTMLTableElement | undefined {
		const el = document.elementFromPoint(clientX, clientY);
		const table = el?.closest('.md-table');
		return table instanceof HTMLTableElement ? table : undefined;
	}

	#findNativeClickedCell(target: Element, wrapper: HTMLElement): { row: number; col: number } | undefined {
		const cell = target.closest('.md-table td');
		if (!(cell instanceof HTMLTableCellElement) || !wrapper.contains(cell)) {
			return undefined;
		}
		const rowEl = cell.parentElement;
		if (!(rowEl instanceof HTMLTableRowElement)) {
			return undefined;
		}
		if (rowEl.classList.contains('md-table-delimiter-row')) {
			return { row: 0, col: cell.cellIndex };
		}
		const gridRow = this.#nativeRowToGridRow(rowEl);
		if (gridRow === undefined) {
			return undefined;
		}
		return { row: gridRow, col: cell.cellIndex };
	}

	#nativeRowToGridRow(rowEl: HTMLTableRowElement): number | undefined {
		const table = rowEl.closest('table');
		if (!(table instanceof HTMLTableElement)) {
			return undefined;
		}
		let gridRow = 0;
		for (let i = 0; i < rowEl.rowIndex; i++) {
			const row = table.rows[i];
			if (row && !row.classList.contains('md-table-delimiter-row')) {
				gridRow++;
			}
		}
		return gridRow;
	}

	#getNativeCellElement(row: number, col: number): HTMLTableCellElement | undefined {
		if (!this.#nativeTable) {
			return undefined;
		}
		let gridRow = 0;
		for (let i = 0; i < this.#nativeTable.rows.length; i++) {
			const nativeRow = this.#nativeTable.rows[i];
			if (!nativeRow || nativeRow.classList.contains('md-table-delimiter-row')) {
				continue;
			}
			if (gridRow === row) {
				return nativeRow.cells[col];
			}
			gridRow++;
		}
		return undefined;
	}

	#getActiveTable(): TableAstNode | undefined {
		if (this.#activeTableOffset === undefined) {
			return undefined;
		}
		const block = findBlockAtOffset(this.#model.document.get(), this.#activeTableOffset);
		return block?.kind === 'table' ? block : undefined;
	}

	#getTableWrapper(offset: number): { wrapper: HTMLElement; nativeTable: HTMLTableElement } | undefined {
		const doc = this.#model.document.get();
		const measurements = this.#view.measuredLayout.measurements.get();
		for (const measurement of measurements) {
			if (measurement.block.kind !== 'table') {
				continue;
			}
			const tableOffset = findNodeOffsetById(doc, measurement.block);
			if (tableOffset !== offset) {
				continue;
			}
			const wrapper = this.#getWrapperElement(measurement);
			if (!wrapper) {
				continue;
			}
			const nativeTable = wrapper.querySelector('.md-table');
			if (!(nativeTable instanceof HTMLTableElement)) {
				continue;
			}
			return { wrapper, nativeTable };
		}
		return undefined;
	}

	#enterGrid(offset: number, focusCell?: { row: number; col: number }): void {
		const table = findBlockAtOffset(this.#model.document.get(), offset);
		if (table?.kind !== 'table') {
			return;
		}

		this.#model.activeBlocksOverride.set([], undefined);
		this.#view.element.classList.add('ib-table-grid-mode');

		const alreadyOpen = this.#activeTableOffset === offset && this.#chromeHost?.isConnected;
		if (this.#activeTableOffset !== undefined && this.#activeTableOffset !== offset) {
			this.#commitIfDirty();
			this.#tearDownGridDom();
		}

		this.#activeTableOffset = offset;
		this.#loadFromTable(table);

		const open = (): void => {
			if (this.#activeTableOffset !== offset) {
				return;
			}
			if (!this.#chromeHost?.isConnected) {
				this.#tearDownGridDom();
				this.#mountChrome();
			}
			this.#focusCell(focusCell?.row ?? 0, focusCell?.col ?? 0);
		};

		if (alreadyOpen && this.#nativeTable?.isConnected) {
			open();
			return;
		}

		// Wait for preview re-render after activeBlocksOverride before measuring cells.
		requestAnimationFrame(() => requestAnimationFrame(open));
	}

	async #commitAndExit(): Promise<void> {
		this.#commitIfDirty();
		this.#exitGrid();
	}

	#exitGrid(): void {
		this.#tearDownGridDom();
		this.#activeTableOffset = undefined;
		this.#focusedCell = undefined;
		this.#dirty = false;
		this.#model.activeBlocksOverride.set(undefined, undefined);
		this.#view.element.classList.remove('ib-table-grid-mode');
	}

	#loadFromTable(table: TableAstNode): void {
		const source = this.#model.sourceText.get().value;
		const parsed = parseTable(table, this.#model.document.get(), source);
		this.#rows = parsed.rows.map(row => [...row]);
		this.#alignments = [...parsed.alignments];
		this.#dirty = false;
	}

	#mountChrome(): void {
		if (this.#activeTableOffset === undefined) {
			return;
		}
		const located = this.#getTableWrapper(this.#activeTableOffset);
		if (!located) {
			return;
		}

		const { wrapper, nativeTable } = located;
		this.#nativeTable = nativeTable;

		wrapper.classList.add('ib-table-grid-active');
		wrapper.style.position = 'relative';

		const chrome = document.createElement('div');
		chrome.className = 'ib-table-grid-chrome';

		const addRowButton = document.createElement('button');
		addRowButton.type = 'button';
		addRowButton.className = 'ib-table-grid-add-row';
		addRowButton.title = 'Add row';
		addRowButton.setAttribute('aria-label', 'Add row');
		addRowButton.textContent = '+';
		addRowButton.addEventListener('pointerdown', event => {
			event.preventDefault();
			event.stopPropagation();
			this.#addRow();
		});

		const addColButton = document.createElement('button');
		addColButton.type = 'button';
		addColButton.className = 'ib-table-grid-add-col';
		addColButton.title = 'Add column';
		addColButton.setAttribute('aria-label', 'Add column');
		addColButton.textContent = '+';
		addColButton.addEventListener('pointerdown', event => {
			event.preventDefault();
			event.stopPropagation();
			this.#addColumn();
		});

		chrome.append(addRowButton, addColButton);
		wrapper.appendChild(chrome);
		this.#chromeHost = chrome;

		this.#resizeObserver?.disconnect();
		this.#resizeObserver = new ResizeObserver(() => this.#syncCellEditorLayout());
		this.#resizeObserver.observe(wrapper);
		this.#resizeObserver.observe(nativeTable);
	}

	#focusCell(row: number, col: number): void {
		this.#commitFocusedCell();
		this.#removeCellEditor();

		const maxRow = this.#rows.length - 1;
		const maxCol = (this.#rows[0]?.length ?? 1) - 1;
		if (maxRow < 0 || maxCol < 0) {
			return;
		}
		row = Math.max(0, Math.min(row, maxRow));
		col = Math.max(0, Math.min(col, maxCol));
		this.#focusedCell = { row, col };

		const nativeCell = this.#getNativeCellElement(row, col);
		if (!nativeCell || !this.#chromeHost) {
			return;
		}

		this.#hiddenNativeCell = nativeCell;
		nativeCell.classList.add('ib-table-grid-native-cell-editing');

		const editor = document.createElement('textarea');
		editor.className = 'ib-table-grid-cell-editor';
		if (row === 0) {
			editor.classList.add('ib-table-grid-cell-editor-header');
		}
		if (this.#options.style === 'wrapped') {
			editor.classList.add('ib-table-grid-cell-editor-wrap');
		}
		editor.setAttribute('aria-label', 'Table cell');
		editor.spellcheck = false;
		editor.rows = 1;
		editor.value = this.#rows[row]?.[col] ?? '';
		editor.addEventListener('input', () => {
			this.#rows[row]![col] = editor.value;
			this.#dirty = true;
			this.#syncCellEditorLayout();
		});
		editor.addEventListener('pointerdown', event => event.stopPropagation());
		editor.addEventListener('keydown', event => {
			event.stopPropagation();
			if (event.key === 'Tab') {
				event.preventDefault();
				this.#commitFocusedCell();
				this.#focusAdjacentCell(event.shiftKey ? -1 : 1);
				return;
			}
			if (event.key === 'Escape') {
				event.preventDefault();
				void this.#commitAndExit();
			}
		});
		editor.addEventListener('blur', () => {
			this.#rows[row]![col] = editor.value;
		});

		this.#chromeHost.appendChild(editor);
		this.#cellEditor = editor;
		this.#editContextSuspend = this.#view.suspendEditContextWhileFocused(editor);
		this.#syncCellEditorLayout();
		editor.focus();
		editor.setSelectionRange(editor.value.length, editor.value.length);
	}

	#syncCellEditorLayout(): void {
		if (!this.#cellEditor || !this.#focusedCell || !this.#chromeHost) {
			return;
		}
		const nativeCell = this.#getNativeCellElement(this.#focusedCell.row, this.#focusedCell.col);
		const wrapper = this.#chromeHost.parentElement;
		if (!nativeCell || !(wrapper instanceof HTMLElement)) {
			return;
		}
		const cellRect = nativeCell.getBoundingClientRect();
		const wrapperRect = wrapper.getBoundingClientRect();
		this.#cellEditor.style.left = `${cellRect.left - wrapperRect.left + wrapper.scrollLeft}px`;
		this.#cellEditor.style.top = `${cellRect.top - wrapperRect.top + wrapper.scrollTop}px`;
		this.#cellEditor.style.width = `${cellRect.width}px`;
		this.#cellEditor.style.height = `${cellRect.height}px`;
		const needed = this.#cellEditor.scrollHeight;
		if (needed > cellRect.height) {
			this.#cellEditor.style.height = `${needed}px`;
		}
	}

	#focusAdjacentCell(direction: 1 | -1): void {
		if (!this.#focusedCell || this.#rows.length === 0) {
			return;
		}
		const colCount = this.#rows[0]?.length ?? 1;
		let index = this.#focusedCell.row * colCount + this.#focusedCell.col + direction;
		const total = this.#rows.length * colCount;
		if (index < 0) {
			index = total - 1;
		} else if (index >= total) {
			index = 0;
		}
		this.#focusCell(Math.floor(index / colCount), index % colCount);
	}

	#commitFocusedCell(): void {
		if (!this.#focusedCell || !this.#cellEditor) {
			return;
		}
		const { row, col } = this.#focusedCell;
		this.#rows[row]![col] = this.#cellEditor.value;
	}

	#commitIfDirty(remount = false): void {
		if (!this.#dirty) {
			return;
		}
		this.#applyTableChange(remount);
	}

	#addRow(): void {
		this.#commitFocusedCell();
		const colCount = this.#rows[0]?.length ?? 1;
		this.#rows.push(Array.from({ length: colCount }, () => ''));
		this.#dirty = true;
		this.#focusedCell = { row: this.#rows.length - 1, col: 0 };
		this.#applyTableChange(true);
	}

	#addColumn(): void {
		this.#commitFocusedCell();
		for (const row of this.#rows) {
			row.push('');
		}
		this.#alignments.push('left');
		this.#dirty = true;
		this.#focusedCell = { row: 0, col: this.#rows[0]!.length - 1 };
		this.#applyTableChange(true);
	}

	#applyTableChange(remount: boolean): void {
		if (this.#activeTableOffset === undefined || this.#isRemounting) {
			return;
		}
		this.#commitFocusedCell();
		const table = this.#getActiveTable();
		if (!table) {
			return;
		}
		const offset = this.#activeTableOffset;
		const focus = this.#focusedCell;
		applyTableData(this.#model, table, this.#rows, this.#alignments);
		this.#dirty = false;
		const updated = this.#getActiveTable();
		if (updated) {
			this.#loadFromTable(updated);
		}
		if (!remount) {
			return;
		}
		this.#isRemounting = true;
		requestAnimationFrame(() => {
			this.#isRemounting = false;
			if (this.#activeTableOffset !== offset) {
				return;
			}
			this.#tearDownGridDom();
			this.#mountChrome();
			if (focus) {
				this.#focusCell(focus.row, focus.col);
			}
		});
	}

	#removeCellEditor(): void {
		this.#editContextSuspend?.dispose();
		this.#editContextSuspend = undefined;
		if (this.#hiddenNativeCell) {
			this.#hiddenNativeCell.classList.remove('ib-table-grid-native-cell-editing');
			this.#hiddenNativeCell = undefined;
		}
		this.#cellEditor?.remove();
		this.#cellEditor = undefined;
	}

	#tearDownGridDom(): void {
		this.#resizeObserver?.disconnect();
		this.#resizeObserver = undefined;
		this.#removeCellEditor();
		this.#nativeTable = undefined;

		const wrapper = this.#chromeHost?.parentElement;
		this.#chromeHost?.remove();
		this.#chromeHost = undefined;
		wrapper?.classList.remove('ib-table-grid-active');
		if (wrapper instanceof HTMLElement) {
			wrapper.style.position = '';
		}
	}
}
