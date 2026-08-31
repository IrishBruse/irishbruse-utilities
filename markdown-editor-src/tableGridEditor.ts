/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import {
	AsyncClipboardStrategy,
	BlockViewNode,
	EditorController,
	EditorModel,
	EditorView,
	LocalHistoryStrategy,
	Selection,
	StringValue,
	blocksIntersecting,
	findBlockAtOffset,
	findNodeOffsetById,
	vscodeKeyboardProfile,
	type BlockMeasurement,
	type TableAstNode,
} from '@vscode/markdown-editor';
import { Disposable, autorun, observableValue } from '@vscode/observables';
import {
	applyTableData,
	deleteColumn,
	deleteRow,
	insertColumn,
	insertRow,
	parseTable,
	type TableAlignment,
} from './tableGridModel';

export interface TableGridOptions {
	readonly maxColumnWidth: number;
	readonly style: 'wrapped' | 'compact';
}

/**
 * Confluence-style table editing: keep the native preview table looking like
 * idle/preview mode, and overlay a nested markdown editor on the focused cell.
 */
export class TableGridController extends Disposable {
	readonly #model: EditorModel;
	readonly #view: EditorView;
	readonly #host: HTMLElement;
	readonly #options: TableGridOptions;
	#activeTableOffset: number | undefined;
	#chromeHost: HTMLElement | undefined;
	#cellEditor: HTMLElement | undefined;
	#cellModel: EditorModel | undefined;
	#cellView: EditorView | undefined;
	#cellController: EditorController | undefined;
	readonly #cellWidth = observableValue<number | undefined>('ibTableCellWidth', undefined);
	#nativeTable: HTMLTableElement | undefined;
	#hiddenNativeCell: HTMLElement | undefined;
	#addRowButton: HTMLButtonElement | undefined;
	#addColButton: HTMLButtonElement | undefined;
	#deleteRowButton: HTMLButtonElement | undefined;
	#deleteColButton: HTMLButtonElement | undefined;
	#insertRowLine: HTMLElement | undefined;
	#insertColLine: HTMLElement | undefined;
	#deleteRowBand: HTMLElement | undefined;
	#deleteColBand: HTMLElement | undefined;
	#rowDotHost: HTMLElement | undefined;
	#colDotHost: HTMLElement | undefined;
	#rows: string[][] = [];
	#alignments: TableAlignment[] = [];
	#focusedCell: { row: number; col: number } | undefined;
	#insertRowIndex = 0;
	#insertColIndex = 0;
	#hoveredRowIndex = 0;
	#hoveredColIndex = 0;
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
		this.#view.element.addEventListener('pointermove', this.#onPointerMove);
		this._register({ dispose: () => this.#view.element.removeEventListener('pointermove', this.#onPointerMove) });

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
			event.stopImmediatePropagation();
			this.#addRow();
			return;
		}
		if (target.closest('.ib-table-grid-add-col')) {
			event.preventDefault();
			event.stopImmediatePropagation();
			this.#addColumn();
			return;
		}
		const rowDot = target.closest('.ib-table-grid-gap-dot-row');
		if (rowDot instanceof HTMLElement && rowDot.dataset.index !== undefined) {
			event.preventDefault();
			event.stopImmediatePropagation();
			this.#insertRowIndex = Number(rowDot.dataset.index);
			this.#addRow();
			return;
		}
		const colDot = target.closest('.ib-table-grid-gap-dot-col');
		if (colDot instanceof HTMLElement && colDot.dataset.index !== undefined) {
			event.preventDefault();
			event.stopImmediatePropagation();
			this.#insertColIndex = Number(colDot.dataset.index);
			this.#addColumn();
			return;
		}
		if (target.closest('.ib-table-grid-delete-row')) {
			event.preventDefault();
			event.stopImmediatePropagation();
			this.#deleteRow();
			return;
		}
		if (target.closest('.ib-table-grid-delete-col')) {
			event.preventDefault();
			event.stopImmediatePropagation();
			this.#deleteColumn();
			return;
		}
		if (target.closest('.ib-table-grid-cell-editor, .ib-table-grid-cell-md-editor')) {
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
			this.#enterGrid(offset, cell, { x: event.clientX, y: event.clientY });
			return;
		}

		if (this.#activeTableOffset !== undefined) {
			this.#commitIfDirty();
			this.#exitGrid();
		}
	};

	#onPointerMove = (event: PointerEvent): void => {
		if (this.#activeTableOffset === undefined || this.#isRemounting) {
			return;
		}
		const target = event.target;
		if (!(target instanceof Element)) {
			return;
		}
		if (!target.closest('.ib-table-grid-active')) {
			this.#chromeHost?.classList.remove(
				'ib-table-grid-preview-row',
				'ib-table-grid-preview-col',
				'ib-table-grid-preview-delete-row',
				'ib-table-grid-preview-delete-col',
			);
			return;
		}
		if (target.closest('.ib-table-grid-add-row')) {
			this.#chromeHost?.classList.add('ib-table-grid-preview-row');
			this.#chromeHost?.classList.remove(
				'ib-table-grid-preview-col',
				'ib-table-grid-preview-delete-row',
				'ib-table-grid-preview-delete-col',
			);
			return;
		}
		if (target.closest('.ib-table-grid-add-col')) {
			this.#chromeHost?.classList.add('ib-table-grid-preview-col');
			this.#chromeHost?.classList.remove(
				'ib-table-grid-preview-row',
				'ib-table-grid-preview-delete-row',
				'ib-table-grid-preview-delete-col',
			);
			return;
		}
		const rowDot = target.closest('.ib-table-grid-gap-dot-row');
		if (rowDot instanceof HTMLElement && rowDot.dataset.index !== undefined) {
			this.#insertRowIndex = Number(rowDot.dataset.index);
			this.#chromeHost?.classList.add('ib-table-grid-preview-row');
			this.#chromeHost?.classList.remove(
				'ib-table-grid-preview-col',
				'ib-table-grid-preview-delete-row',
				'ib-table-grid-preview-delete-col',
			);
			this.#positionInsertAffordance();
			return;
		}
		const colDot = target.closest('.ib-table-grid-gap-dot-col');
		if (colDot instanceof HTMLElement && colDot.dataset.index !== undefined) {
			this.#insertColIndex = Number(colDot.dataset.index);
			this.#chromeHost?.classList.add('ib-table-grid-preview-col');
			this.#chromeHost?.classList.remove(
				'ib-table-grid-preview-row',
				'ib-table-grid-preview-delete-row',
				'ib-table-grid-preview-delete-col',
			);
			this.#positionInsertAffordance();
			return;
		}
		if (target.closest('.ib-table-grid-delete-row')) {
			this.#chromeHost?.classList.add('ib-table-grid-preview-delete-row');
			this.#chromeHost?.classList.remove(
				'ib-table-grid-preview-row',
				'ib-table-grid-preview-col',
				'ib-table-grid-preview-delete-col',
			);
			return;
		}
		if (target.closest('.ib-table-grid-delete-col')) {
			this.#chromeHost?.classList.add('ib-table-grid-preview-delete-col');
			this.#chromeHost?.classList.remove(
				'ib-table-grid-preview-row',
				'ib-table-grid-preview-col',
				'ib-table-grid-preview-delete-row',
			);
			return;
		}
		this.#updateInsertFromPoint(event.clientX, event.clientY);
	};

	#onScroll = (): void => {
		this.#syncCellEditorLayout();
		this.#positionInsertAffordance();
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

	#enterGrid(offset: number, focusCell?: { row: number; col: number }, point?: { x: number; y: number }): void {
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
			if (point) {
				this.#updateInsertFromPoint(point.x, point.y);
			} else {
				this.#updateInsertFromFocus();
			}
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

		const addRowButton = this.#createChromeButton('ib-table-grid-add-row', '+', () => this.#addRow());
		const addColButton = this.#createChromeButton('ib-table-grid-add-col', '+', () => this.#addColumn());
		const deleteRowButton = this.#createChromeButton('ib-table-grid-delete-row', '−', () => this.#deleteRow());
		const deleteColButton = this.#createChromeButton('ib-table-grid-delete-col', '−', () => this.#deleteColumn());

		const insertRowLine = document.createElement('div');
		insertRowLine.className = 'ib-table-grid-insert-row-line';
		insertRowLine.setAttribute('aria-hidden', 'true');

		const insertColLine = document.createElement('div');
		insertColLine.className = 'ib-table-grid-insert-col-line';
		insertColLine.setAttribute('aria-hidden', 'true');

		const deleteRowBand = document.createElement('div');
		deleteRowBand.className = 'ib-table-grid-delete-row-band';
		deleteRowBand.setAttribute('aria-hidden', 'true');

		const deleteColBand = document.createElement('div');
		deleteColBand.className = 'ib-table-grid-delete-col-band';
		deleteColBand.setAttribute('aria-hidden', 'true');

		const rowDotHost = document.createElement('div');
		rowDotHost.className = 'ib-table-grid-gap-dots ib-table-grid-gap-dots-row';
		rowDotHost.setAttribute('aria-hidden', 'true');
		const colDotHost = document.createElement('div');
		colDotHost.className = 'ib-table-grid-gap-dots ib-table-grid-gap-dots-col';
		colDotHost.setAttribute('aria-hidden', 'true');

		chrome.append(
			addRowButton,
			addColButton,
			deleteRowButton,
			deleteColButton,
			insertRowLine,
			insertColLine,
			deleteRowBand,
			deleteColBand,
			rowDotHost,
			colDotHost,
		);
		wrapper.appendChild(chrome);
		this.#chromeHost = chrome;
		this.#addRowButton = addRowButton;
		this.#addColButton = addColButton;
		this.#deleteRowButton = deleteRowButton;
		this.#deleteColButton = deleteColButton;
		this.#insertRowLine = insertRowLine;
		this.#insertColLine = insertColLine;
		this.#deleteRowBand = deleteRowBand;
		this.#deleteColBand = deleteColBand;
		this.#rowDotHost = rowDotHost;
		this.#colDotHost = colDotHost;
		this.#positionInsertAffordance();

		this.#resizeObserver?.disconnect();
		this.#resizeObserver = new ResizeObserver(() => {
			this.#syncCellEditorLayout();
			this.#positionInsertAffordance();
		});
		this.#resizeObserver.observe(wrapper);
		this.#resizeObserver.observe(nativeTable);
	}

	#createChromeButton(className: string, label: string, onPress: () => void): HTMLButtonElement {
		const button = document.createElement('button');
		button.type = 'button';
		button.className = className;
		button.textContent = label;
		button.addEventListener('pointerdown', event => {
			event.preventDefault();
			event.stopImmediatePropagation();
			onPress();
		});
		return button;
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

		const host = document.createElement('div');
		host.className = 'ib-table-grid-cell-editor';
		if (row === 0) {
			host.classList.add('ib-table-grid-cell-editor-header');
		}
		host.setAttribute('aria-label', 'Table cell');

		const text = this.#rows[row]?.[col] ?? '';
		const cellModel = new EditorModel();
		cellModel.sourceText.set(new StringValue(text), undefined);
		cellModel.readonlyMode.set(false, undefined);
		cellModel.selection.set(Selection.collapsed(text.length), undefined);

		const cellView = new EditorView(cellModel, {
			classNames: ['md-theme-vscode-default', 'ib-table-grid-cell-md-editor'],
			showReadonlyToggle: false,
			limitedWidth: this.#cellWidth,
		});
		const cellController = new EditorController(cellModel, cellView, {
			clipboardStrategy: new AsyncClipboardStrategy(),
			keyboardProfile: vscodeKeyboardProfile,
			historyStrategy: new LocalHistoryStrategy(cellModel),
			find: false,
		});

		cellView.element.addEventListener('keydown', event => {
			if (event.key === 'Tab') {
				event.preventDefault();
				event.stopPropagation();
				this.#commitFocusedCell();
				this.#focusAdjacentCell(event.shiftKey ? -1 : 1);
				return;
			}
			if (event.key === 'Escape') {
				event.preventDefault();
				event.stopPropagation();
				void this.#commitAndExit();
			}
		}, true);
		cellView.element.addEventListener('keydown', event => event.stopPropagation());
		cellView.element.addEventListener('pointerdown', event => event.stopPropagation());

		host.appendChild(cellView.element);
		this.#chromeHost.appendChild(host);
		this.#cellEditor = host;
		this.#cellModel = cellModel;
		this.#cellView = cellView;
		this.#cellController = cellController;
		this.#editContextSuspend = this.#view.suspendEditContextWhileFocused(cellView.element);
		this.#syncCellEditorLayout();
		cellView.focus();
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
		this.#cellEditor.style.minHeight = `${cellRect.height}px`;
		this.#cellWidth.set(Math.max(40, cellRect.width), undefined);
		const needed = this.#cellEditor.scrollHeight;
		this.#cellEditor.style.height = `${Math.max(cellRect.height, needed)}px`;
	}

	#commitFocusedCell(): void {
		if (!this.#focusedCell || !this.#cellModel) {
			return;
		}
		const { row, col } = this.#focusedCell;
		const rowCells = this.#rows[row];
		if (!rowCells || rowCells[col] === undefined) {
			return;
		}
		const text = this.#cellModel.sourceText.get().value;
		if (rowCells[col] !== text) {
			rowCells[col] = text;
			this.#dirty = true;
		}
	}

	#removeCellEditor(): void {
		this.#commitFocusedCell();
		this.#editContextSuspend?.dispose();
		this.#editContextSuspend = undefined;
		if (this.#hiddenNativeCell) {
			this.#hiddenNativeCell.classList.remove('ib-table-grid-native-cell-editing');
			this.#hiddenNativeCell = undefined;
		}
		this.#cellController?.dispose();
		this.#cellController = undefined;
		this.#cellView?.dispose();
		this.#cellView = undefined;
		this.#cellModel = undefined;
		this.#cellEditor?.remove();
		this.#cellEditor = undefined;
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

	#commitIfDirty(remount = false): void {
		if (!this.#dirty) {
			return;
		}
		this.#applyTableChange(remount);
	}

	#addRow(): void {
		if (this.#activeTableOffset === undefined || this.#isRemounting) {
			return;
		}
		this.#removeCellEditor();
		const index = this.#insertRowIndex;
		this.#rows = insertRow(this.#rows, index);
		this.#dirty = true;
		this.#focusedCell = { row: index, col: Math.min(this.#focusedCell?.col ?? 0, (this.#rows[0]?.length ?? 1) - 1) };
		this.#insertRowIndex = index + 1;
		this.#applyTableChange(true);
	}

	#addColumn(): void {
		if (this.#activeTableOffset === undefined || this.#isRemounting) {
			return;
		}
		this.#removeCellEditor();
		const index = this.#insertColIndex;
		const inserted = insertColumn(this.#rows, this.#alignments, index);
		this.#rows = inserted.rows;
		this.#alignments = inserted.alignments;
		this.#dirty = true;
		this.#focusedCell = { row: Math.min(this.#focusedCell?.row ?? 0, this.#rows.length - 1), col: index };
		this.#insertColIndex = index + 1;
		this.#applyTableChange(true);
	}

	#deleteRow(): void {
		if (this.#activeTableOffset === undefined || this.#isRemounting || this.#rows.length <= 1) {
			return;
		}
		this.#removeCellEditor();
		const index = this.#hoveredRowIndex;
		this.#rows = deleteRow(this.#rows, index);
		this.#dirty = true;
		const row = Math.min(index, this.#rows.length - 1);
		const col = Math.min(this.#focusedCell?.col ?? 0, (this.#rows[0]?.length ?? 1) - 1);
		this.#focusedCell = { row, col };
		this.#hoveredRowIndex = row;
		this.#applyTableChange(true);
	}

	#deleteColumn(): void {
		const colCount = this.#rows[0]?.length ?? 0;
		if (this.#activeTableOffset === undefined || this.#isRemounting || colCount <= 1) {
			return;
		}
		this.#removeCellEditor();
		const index = this.#hoveredColIndex;
		const deleted = deleteColumn(this.#rows, this.#alignments, index);
		this.#rows = deleted.rows;
		this.#alignments = deleted.alignments;
		this.#dirty = true;
		const row = Math.min(this.#focusedCell?.row ?? 0, this.#rows.length - 1);
		const col = Math.min(index, (this.#rows[0]?.length ?? 1) - 1);
		this.#focusedCell = { row, col };
		this.#hoveredColIndex = col;
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
		if (remount) {
			this.#isRemounting = true;
		}
		applyTableData(this.#model, table, this.#rows, this.#alignments);
		this.#dirty = false;
		const updated = this.#getActiveTable();
		if (updated) {
			this.#loadFromTable(updated);
		}
		if (!remount) {
			return;
		}
		requestAnimationFrame(() => requestAnimationFrame(() => {
			this.#isRemounting = false;
			if (this.#activeTableOffset !== offset) {
				return;
			}
			this.#tearDownGridDom();
			this.#mountChrome();
			if (focus) {
				this.#focusCell(focus.row, focus.col);
			}
			this.#positionInsertAffordance();
		}));
	}

	#getGridGeometry(): { wrapper: HTMLElement; rowStops: number[]; colStops: number[]; tableRect: DOMRect; wrapperRect: DOMRect } | undefined {
		const wrapper = this.#chromeHost?.parentElement;
		if (!this.#nativeTable || !(wrapper instanceof HTMLElement)) {
			return undefined;
		}
		const dataRows: HTMLTableRowElement[] = [];
		for (let i = 0; i < this.#nativeTable.rows.length; i++) {
			const row = this.#nativeTable.rows[i];
			if (row && !row.classList.contains('md-table-delimiter-row')) {
				dataRows.push(row);
			}
		}
		if (dataRows.length === 0) {
			return undefined;
		}
		const firstRow = dataRows[0]!;
		const rowStops: number[] = [];
		for (const row of dataRows) {
			const rect = row.getBoundingClientRect();
			if (rowStops.length === 0) {
				rowStops.push(rect.top);
			}
			rowStops.push(rect.bottom);
		}
		const colStops: number[] = [];
		for (let col = 0; col < firstRow.cells.length; col++) {
			const rect = firstRow.cells[col]!.getBoundingClientRect();
			if (colStops.length === 0) {
				colStops.push(rect.left);
			}
			colStops.push(rect.right);
		}
		if (rowStops.length === 0 || colStops.length === 0) {
			return undefined;
		}
		return {
			wrapper,
			rowStops,
			colStops,
			tableRect: this.#nativeTable.getBoundingClientRect(),
			wrapperRect: wrapper.getBoundingClientRect(),
		};
	}

	#nearestStop(stops: readonly number[], value: number): number {
		let best = 0;
		let bestDist = Infinity;
		for (let i = 0; i < stops.length; i++) {
			const dist = Math.abs(stops[i]! - value);
			if (dist < bestDist) {
				bestDist = dist;
				best = i;
			}
		}
		return best;
	}

	#indexInBands(stops: readonly number[], value: number): number {
		if (stops.length < 2) {
			return 0;
		}
		if (value < stops[0]!) {
			return 0;
		}
		for (let i = 0; i < stops.length - 1; i++) {
			if (value < stops[i + 1]!) {
				return i;
			}
		}
		return stops.length - 2;
	}

	#updateInsertFromPoint(clientX: number, clientY: number): void {
		const geo = this.#getGridGeometry();
		if (!geo) {
			return;
		}
		this.#insertRowIndex = this.#nearestStop(geo.rowStops, clientY);
		this.#insertColIndex = this.#nearestStop(geo.colStops, clientX);
		this.#hoveredRowIndex = this.#indexInBands(geo.rowStops, clientY);
		this.#hoveredColIndex = this.#indexInBands(geo.colStops, clientX);
		const hit = this.#hitTestCell(clientX, clientY);
		if (hit) {
			this.#hoveredRowIndex = hit.row;
			this.#hoveredColIndex = hit.col;
		}
		const overHeader = hit?.row === 0;
		const edge = 40;
		const { tableRect } = geo;
		const nearLeft = clientX >= tableRect.left - edge && clientX <= tableRect.left + edge;
		const nearTop = clientY >= tableRect.top - edge && clientY <= tableRect.top + edge;
		const inRows = clientY >= tableRect.top && clientY <= tableRect.bottom;
		const inCols = clientX >= tableRect.left && clientX <= tableRect.right;
		const canDeleteRow = this.#rows.length > 1;
		const canDeleteCol = (this.#rows[0]?.length ?? 0) > 1;
		this.#chromeHost?.classList.remove('ib-table-grid-preview-row', 'ib-table-grid-preview-col');
		if (overHeader && canDeleteCol) {
			this.#chromeHost?.classList.add('ib-table-grid-preview-delete-col');
			this.#chromeHost?.classList.remove('ib-table-grid-preview-delete-row');
		} else {
			this.#chromeHost?.classList.toggle(
				'ib-table-grid-preview-delete-row',
				nearLeft && inRows && canDeleteRow,
			);
			this.#chromeHost?.classList.toggle(
				'ib-table-grid-preview-delete-col',
				nearTop && inCols && canDeleteCol,
			);
		}
		this.#positionInsertAffordance(geo);
	}

	#updateInsertFromFocus(): void {
		const colCount = this.#rows[0]?.length ?? 0;
		this.#insertRowIndex = this.#focusedCell ? this.#focusedCell.row + 1 : this.#rows.length;
		this.#insertColIndex = this.#focusedCell ? this.#focusedCell.col + 1 : colCount;
		this.#hoveredRowIndex = this.#focusedCell?.row ?? 0;
		this.#hoveredColIndex = this.#focusedCell?.col ?? 0;
		this.#positionInsertAffordance();
	}

	#positionInsertAffordance(geo = this.#getGridGeometry()): void {
		if (
			!geo
			|| !this.#addRowButton
			|| !this.#addColButton
			|| !this.#deleteRowButton
			|| !this.#deleteColButton
			|| !this.#insertRowLine
			|| !this.#insertColLine
			|| !this.#deleteRowBand
			|| !this.#deleteColBand
		) {
			return;
		}
		this.#insertRowIndex = Math.max(0, Math.min(this.#insertRowIndex, geo.rowStops.length - 1));
		this.#insertColIndex = Math.max(0, Math.min(this.#insertColIndex, geo.colStops.length - 1));
		const rowCount = Math.max(0, geo.rowStops.length - 1);
		const colCount = Math.max(0, geo.colStops.length - 1);
		this.#hoveredRowIndex = Math.max(0, Math.min(this.#hoveredRowIndex, Math.max(0, rowCount - 1)));
		this.#hoveredColIndex = Math.max(0, Math.min(this.#hoveredColIndex, Math.max(0, colCount - 1)));
		const rowY = geo.rowStops[this.#insertRowIndex]!;
		const colX = geo.colStops[this.#insertColIndex]!;
		const hoveredRowTop = geo.rowStops[this.#hoveredRowIndex]!;
		const hoveredRowBottom = geo.rowStops[this.#hoveredRowIndex + 1] ?? hoveredRowTop;
		const hoveredColLeft = geo.colStops[this.#hoveredColIndex]!;
		const hoveredColRight = geo.colStops[this.#hoveredColIndex + 1] ?? hoveredColLeft;
		const { wrapper, wrapperRect, tableRect } = geo;
		const x = (client: number): number => client - wrapperRect.left + wrapper.scrollLeft;
		const y = (client: number): number => client - wrapperRect.top + wrapper.scrollTop;

		const addSize = 22;
		const addGap = 8;
		const deleteGap = addGap + addSize + addGap;
		const addRowLeft = x(tableRect.left) - addSize - addGap;
		const addColTop = y(tableRect.top) - addSize - addGap;
		this.#addRowButton.style.top = `${y(rowY) - addSize / 2}px`;
		this.#addRowButton.style.left = `${addRowLeft}px`;
		this.#addColButton.style.left = `${x(colX) - addSize / 2}px`;
		this.#addColButton.style.top = `${addColTop}px`;

		this.#deleteRowButton.style.top = `${y((hoveredRowTop + hoveredRowBottom) / 2) - addSize / 2}px`;
		this.#deleteRowButton.style.left = `${x(tableRect.left) - addSize - deleteGap}px`;
		this.#deleteColButton.style.left = `${x((hoveredColLeft + hoveredColRight) / 2) - addSize / 2}px`;
		this.#deleteColButton.style.top = `${y(tableRect.top) - addSize - deleteGap}px`;

		this.#insertRowLine.style.left = `${x(tableRect.left)}px`;
		this.#insertRowLine.style.top = `${y(rowY)}px`;
		this.#insertRowLine.style.width = `${tableRect.width}px`;
		this.#insertColLine.style.top = `${y(tableRect.top)}px`;
		this.#insertColLine.style.left = `${x(colX)}px`;
		this.#insertColLine.style.height = `${tableRect.height}px`;

		this.#deleteRowBand.style.left = `${x(tableRect.left)}px`;
		this.#deleteRowBand.style.top = `${y(hoveredRowTop)}px`;
		this.#deleteRowBand.style.width = `${tableRect.width}px`;
		this.#deleteRowBand.style.height = `${hoveredRowBottom - hoveredRowTop}px`;
		this.#deleteColBand.style.left = `${x(hoveredColLeft)}px`;
		this.#deleteColBand.style.top = `${y(tableRect.top)}px`;
		this.#deleteColBand.style.width = `${hoveredColRight - hoveredColLeft}px`;
		this.#deleteColBand.style.height = `${tableRect.height}px`;

		this.#addRowButton.title = this.#insertGapLabel('row', this.#insertRowIndex, geo.rowStops.length - 1);
		this.#addRowButton.setAttribute('aria-label', this.#addRowButton.title);
		this.#addColButton.title = this.#insertGapLabel('column', this.#insertColIndex, geo.colStops.length - 1);
		this.#addColButton.setAttribute('aria-label', this.#addColButton.title);
		this.#deleteRowButton.title = `Delete row ${this.#hoveredRowIndex + 1}`;
		this.#deleteRowButton.setAttribute('aria-label', this.#deleteRowButton.title);
		this.#deleteColButton.title = `Delete column ${this.#hoveredColIndex + 1}`;
		this.#deleteColButton.setAttribute('aria-label', this.#deleteColButton.title);

		this.#syncGapDots(
			this.#rowDotHost,
			'ib-table-grid-gap-dot-row',
			geo.rowStops,
			index => ({
				left: addRowLeft + addSize / 2,
				top: y(geo.rowStops[index]!),
			}),
			this.#chromeHost?.classList.contains('ib-table-grid-preview-row') ? this.#insertRowIndex : -1,
		);
		this.#syncGapDots(
			this.#colDotHost,
			'ib-table-grid-gap-dot-col',
			geo.colStops,
			index => ({
				left: x(geo.colStops[index]!),
				top: addColTop + addSize / 2,
			}),
			this.#chromeHost?.classList.contains('ib-table-grid-preview-col') ? this.#insertColIndex : -1,
		);
	}

	#syncGapDots(
		host: HTMLElement | undefined,
		kindClass: string,
		stops: readonly number[],
		centerAt: (index: number) => { left: number; top: number },
		activeIndex: number,
	): void {
		if (!host) {
			return;
		}
		while (host.childElementCount > stops.length) {
			host.lastElementChild?.remove();
		}
		while (host.childElementCount < stops.length) {
			const dot = document.createElement('button');
			dot.type = 'button';
			dot.className = `ib-table-grid-gap-dot ${kindClass}`;
			dot.tabIndex = -1;
			host.appendChild(dot);
		}
		for (let i = 0; i < stops.length; i++) {
			const dot = host.children[i];
			if (!(dot instanceof HTMLElement)) {
				continue;
			}
			const { left, top } = centerAt(i);
			dot.dataset.index = String(i);
			dot.style.left = `${left}px`;
			dot.style.top = `${top}px`;
			dot.classList.toggle('is-active', i === activeIndex);
			const kind = kindClass.endsWith('-row') ? 'row' : 'column';
			dot.title = this.#insertGapLabel(kind, i, stops.length - 1);
		}
	}

	#insertGapLabel(kind: 'row' | 'column', index: number, lastIndex: number): string {
		if (index <= 0) {
			return `Add ${kind} before the first ${kind}`;
		}
		if (index >= lastIndex) {
			return `Add ${kind} after the last ${kind}`;
		}
		return `Add ${kind} between ${kind} ${index} and ${kind} ${index + 1}`;
	}

	#tearDownGridDom(): void {
		this.#resizeObserver?.disconnect();
		this.#resizeObserver = undefined;
		this.#removeCellEditor();
		this.#nativeTable = undefined;
		this.#addRowButton = undefined;
		this.#addColButton = undefined;
		this.#deleteRowButton = undefined;
		this.#deleteColButton = undefined;
		this.#insertRowLine = undefined;
		this.#insertColLine = undefined;
		this.#deleteRowBand = undefined;
		this.#deleteColBand = undefined;
		this.#rowDotHost = undefined;
		this.#colDotHost = undefined;

		const wrapper = this.#chromeHost?.parentElement;
		this.#chromeHost?.remove();
		this.#chromeHost = undefined;
		wrapper?.classList.remove('ib-table-grid-active');
		if (wrapper instanceof HTMLElement) {
			wrapper.style.position = '';
		}
	}
}
