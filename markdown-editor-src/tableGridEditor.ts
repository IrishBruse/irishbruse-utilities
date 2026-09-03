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
	#insertRowLine: HTMLElement | undefined;
	#insertColLine: HTMLElement | undefined;
	#rowDotHost: HTMLElement | undefined;
	#colDotHost: HTMLElement | undefined;
	#rowHandleHost: HTMLElement | undefined;
	#colHandleHost: HTMLElement | undefined;
	#selectionBand: HTMLElement | undefined;
	#rows: string[][] = [];
	#alignments: TableAlignment[] = [];
	#focusedCell: { row: number; col: number } | undefined;
	#insertRowIndex = 0;
	#insertColIndex = 0;
	#selectedAxis: { kind: 'row' | 'col'; index: number } | undefined;
	#dirty = false;
	#isRemounting = false;
	#editContextSuspend: { dispose(): void } | undefined;
	#resizeObserver: ResizeObserver | undefined;
	#cellLayoutSub: { dispose(): void } | undefined;
	#cellFitWidth = 0;
	#cellFitHeight = 0;
	#cellPreviewHeight = 0;
	#fittingCellHeight = false;
	#cellFitRetry = false;

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
		this.#view.element.addEventListener('keydown', this.#onKeyDown, true);
		this._register({ dispose: () => this.#view.element.removeEventListener('keydown', this.#onKeyDown, true) });

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
		const rowHandle = target.closest('.ib-table-grid-row-handle');
		if (rowHandle instanceof HTMLElement && rowHandle.dataset.index !== undefined) {
			event.preventDefault();
			event.stopImmediatePropagation();
			this.#selectAxis('row', Number(rowHandle.dataset.index));
			return;
		}
		const colHandle = target.closest('.ib-table-grid-col-handle');
		if (colHandle instanceof HTMLElement && colHandle.dataset.index !== undefined) {
			event.preventDefault();
			event.stopImmediatePropagation();
			this.#selectAxis('col', Number(colHandle.dataset.index));
			return;
		}
		if (target.closest('.ib-table-grid-cell-editor, .ib-table-grid-cell-md-editor')) {
			return;
		}
		if (target.closest('a[href], [data-md-url]')) {
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
			);
			return;
		}
		if (target.closest('.ib-table-grid-add-row')) {
			this.#chromeHost?.classList.add('ib-table-grid-preview-row');
			this.#chromeHost?.classList.remove('ib-table-grid-preview-col');
			return;
		}
		if (target.closest('.ib-table-grid-add-col')) {
			this.#chromeHost?.classList.add('ib-table-grid-preview-col');
			this.#chromeHost?.classList.remove('ib-table-grid-preview-row');
			return;
		}
		const rowDot = target.closest('.ib-table-grid-gap-dot-row');
		if (rowDot instanceof HTMLElement && rowDot.dataset.index !== undefined) {
			this.#insertRowIndex = Number(rowDot.dataset.index);
			this.#chromeHost?.classList.add('ib-table-grid-preview-row');
			this.#chromeHost?.classList.remove('ib-table-grid-preview-col');
			this.#positionInsertAffordance();
			return;
		}
		const colDot = target.closest('.ib-table-grid-gap-dot-col');
		if (colDot instanceof HTMLElement && colDot.dataset.index !== undefined) {
			this.#insertColIndex = Number(colDot.dataset.index);
			this.#chromeHost?.classList.add('ib-table-grid-preview-col');
			this.#chromeHost?.classList.remove('ib-table-grid-preview-row');
			this.#positionInsertAffordance();
			return;
		}
		this.#updateInsertFromPoint(event.clientX, event.clientY);
	};

	#onKeyDown = (event: KeyboardEvent): void => {
		if (this.#activeTableOffset === undefined || this.#cellEditor || !this.#selectedAxis) {
			return;
		}
		if (event.key === 'Escape') {
			event.preventDefault();
			event.stopImmediatePropagation();
			this.#clearAxisSelection();
			return;
		}
		if (event.key !== 'Backspace' && event.key !== 'Delete') {
			return;
		}
		event.preventDefault();
		event.stopImmediatePropagation();
		this.#deleteSelection();
	};

	#onScroll = (): void => {
		this.#syncCellEditorLayout(false);
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
		return this.#resolveActiveTable();
	}

	#resolveActiveTable(): TableAstNode | undefined {
		if (this.#activeTableOffset === undefined) {
			return undefined;
		}
		const doc = this.#model.document.get();
		const atOffset = findBlockAtOffset(doc, this.#activeTableOffset);
		if (atOffset?.kind === 'table') {
			return atOffset;
		}
		// After insert/replace the caret offset can briefly sit past the table
		// start; fall back to the measured table that still matches our offset.
		const measurements = this.#view.measuredLayout.measurements.get();
		for (const measurement of measurements) {
			if (measurement.block.kind !== 'table') {
				continue;
			}
			const tableOffset = findNodeOffsetById(doc, measurement.block);
			if (tableOffset === this.#activeTableOffset || measurement.absoluteStart === this.#activeTableOffset) {
				return measurement.block;
			}
		}
		return undefined;
	}

	#refreshActiveOffset(table: TableAstNode): void {
		const offset = findNodeOffsetById(this.#model.document.get(), table);
		if (offset !== undefined) {
			this.#activeTableOffset = offset;
		}
	}

	#getTableWrapper(offset: number): { wrapper: HTMLElement; nativeTable: HTMLTableElement } | undefined {
		const doc = this.#model.document.get();
		const active = this.#resolveActiveTable();
		const measurements = this.#view.measuredLayout.measurements.get();
		for (const measurement of measurements) {
			if (measurement.block.kind !== 'table') {
				continue;
			}
			const tableOffset = findNodeOffsetById(doc, measurement.block);
			const matches = tableOffset === offset
				|| measurement.absoluteStart === offset
				|| (active !== undefined && measurement.block === active);
			if (!matches) {
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
			this.#flushTableEdits();
			this.#tearDownGridDom();
		}

		this.#activeTableOffset = offset;

		// Already editing this table: keep in-memory rows (including edits to a
		// newly inserted empty cell) and only move the cell editor.
		if (alreadyOpen) {
			this.#focusCell(focusCell?.row ?? 0, focusCell?.col ?? 0);
			if (point) {
				this.#updateInsertFromPoint(point.x, point.y);
			} else {
				this.#updateInsertFromFocus();
			}
			return;
		}

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

		if (this.#nativeTable?.isConnected) {
			open();
			return;
		}

		// Wait for preview re-render after activeBlocksOverride before measuring cells.
		requestAnimationFrame(() => requestAnimationFrame(open));
	}

	async #commitAndExit(): Promise<void> {
		this.#exitGrid();
	}

	#exitGrid(): void {
		// Must flush before tear-down. removeCellEditor alone only updates #rows;
		// clearing #dirty afterwards would drop edits (common after insert row/col).
		this.#flushTableEdits();
		this.#tearDownGridDom();
		this.#activeTableOffset = undefined;
		this.#focusedCell = undefined;
		this.#dirty = false;
		this.#selectedAxis = undefined;
		this.#isRemounting = false;
		this.#model.activeBlocksOverride.set(undefined, undefined);
		this.#view.element.classList.remove('ib-table-grid-mode');
	}

	/** Write the open cell (if any) and dirty #rows back into the document. */
	#flushTableEdits(): void {
		this.#isRemounting = false;
		this.#commitFocusedCell();
		if (!this.#dirty || this.#activeTableOffset === undefined) {
			return;
		}
		const table = this.#resolveActiveTable();
		if (!table) {
			return;
		}
		applyTableData(this.#model, table, this.#rows, this.#alignments);
		this.#dirty = false;
		const updated = this.#resolveActiveTable();
		if (updated) {
			this.#refreshActiveOffset(updated);
		}
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

		const insertRowLine = document.createElement('div');
		insertRowLine.className = 'ib-table-grid-insert-row-line';
		insertRowLine.setAttribute('aria-hidden', 'true');

		const insertColLine = document.createElement('div');
		insertColLine.className = 'ib-table-grid-insert-col-line';
		insertColLine.setAttribute('aria-hidden', 'true');

		const selectionBand = document.createElement('div');
		selectionBand.className = 'ib-table-grid-selection-band';
		selectionBand.setAttribute('aria-hidden', 'true');

		const rowDotHost = document.createElement('div');
		rowDotHost.className = 'ib-table-grid-gap-dots ib-table-grid-gap-dots-row';
		rowDotHost.setAttribute('aria-hidden', 'true');
		const colDotHost = document.createElement('div');
		colDotHost.className = 'ib-table-grid-gap-dots ib-table-grid-gap-dots-col';
		colDotHost.setAttribute('aria-hidden', 'true');
		const rowHandleHost = document.createElement('div');
		rowHandleHost.className = 'ib-table-grid-handles ib-table-grid-handles-row';
		const colHandleHost = document.createElement('div');
		colHandleHost.className = 'ib-table-grid-handles ib-table-grid-handles-col';

		chrome.append(
			addRowButton,
			addColButton,
			insertRowLine,
			insertColLine,
			selectionBand,
			rowHandleHost,
			colHandleHost,
			rowDotHost,
			colDotHost,
		);
		wrapper.appendChild(chrome);
		this.#chromeHost = chrome;
		this.#addRowButton = addRowButton;
		this.#addColButton = addColButton;
		this.#insertRowLine = insertRowLine;
		this.#insertColLine = insertColLine;
		this.#selectionBand = selectionBand;
		this.#rowDotHost = rowDotHost;
		this.#colDotHost = colDotHost;
		this.#rowHandleHost = rowHandleHost;
		this.#colHandleHost = colHandleHost;
		this.#syncColumnWidths();
		this.#positionInsertAffordance();

		this.#resizeObserver?.disconnect();
		this.#resizeObserver = new ResizeObserver(() => {
			this.#syncCellEditorLayout(false);
			this.#positionInsertAffordance();
		});
		this.#resizeObserver.observe(wrapper);
		this.#resizeObserver.observe(nativeTable);
	}

	/**
	 * Cap wide columns so the table stays in the content column and wraps.
	 * Leave short columns alone so they keep their intrinsic width.
	 */
	#syncColumnWidths(): void {
		const table = this.#nativeTable;
		if (!table) {
			return;
		}
		const colCount = this.#rows[0]?.length ?? 0;
		if (colCount === 0) {
			return;
		}

		const dataRows = [...table.rows].filter(row => !row.classList.contains('md-table-delimiter-row'));
		for (const row of dataRows) {
			for (const cell of row.cells) {
				cell.style.minWidth = '';
				cell.style.maxWidth = '';
				cell.style.width = '';
			}
		}

		const wrapper = table.closest('.md-table-wrapper');
		const available = wrapper instanceof HTMLElement
			? Math.max(0, wrapper.clientWidth)
			: table.parentElement?.clientWidth ?? 0;
		if (available <= 0) {
			return;
		}

		// Prefer content-based sizing, but never let one column dominate past
		// the configured wrap limit or the remaining share of the content width.
		const configuredMax = this.#options.style === 'wrapped'
			? this.#measureCh(this.#options.maxColumnWidth)
			: available;
		const softMax = Math.max(64, Math.min(configuredMax, available * 0.72));

		const emptyMinPx = Math.round(Math.min(96, Math.max(48, available / Math.max(colCount * 2, 1))));

		for (let col = 0; col < colCount; col++) {
			const empty = this.#rows.every(row => !(row[col] ?? '').trim());
			for (const row of dataRows) {
				const cell = row.cells[col];
				if (!cell) {
					continue;
				}
				cell.style.maxWidth = `${Math.round(softMax)}px`;
				if (empty) {
					cell.style.minWidth = `${emptyMinPx}px`;
				}
			}
		}
	}

	#measureCh(ch: number): number {
		const host = this.#nativeTable ?? this.#view.element;
		const probe = host.ownerDocument.createElement('span');
		probe.style.cssText = 'position:absolute;visibility:hidden;pointer-events:none;white-space:pre;font:inherit';
		probe.textContent = '0'.repeat(Math.max(1, Math.round(ch)));
		host.appendChild(probe);
		const width = probe.getBoundingClientRect().width;
		probe.remove();
		return Math.max(ch * 6, width);
	}

	#clearColumnWidths(table: HTMLTableElement | undefined): void {
		if (!table) {
			return;
		}
		for (const row of table.rows) {
			for (const cell of row.cells) {
				cell.style.minWidth = '';
				cell.style.maxWidth = '';
				cell.style.width = '';
				cell.style.height = '';
			}
		}
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
		this.#clearAxisSelection();
		this.#commitFocusedCell();

		const maxRow = this.#rows.length - 1;
		const maxCol = (this.#rows[0]?.length ?? 1) - 1;
		if (maxRow < 0 || maxCol < 0) {
			return;
		}
		row = Math.max(0, Math.min(row, maxRow));
		col = Math.max(0, Math.min(col, maxCol));

		// Write the previous cell into the document before hiding the overlay.
		// Otherwise the native preview still shows the old cell text.
		if (this.#dirty && !this.#isRemounting) {
			this.#removeCellEditor();
			this.#focusedCell = { row, col };
			this.#applyTableChange(true);
			return;
		}

		this.#removeCellEditor();
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
		this.#cellLayoutSub?.dispose();
		this.#cellLayoutSub = autorun((reader) => {
			reader.readObservable(cellModel.sourceText);
			this.#syncCellEditorLayout(true);
		});
		this.#syncCellEditorLayout(true);
		cellView.focus();
	}

	#syncCellEditorLayout(remeasure: boolean): void {
		if (this.#fittingCellHeight || !this.#cellEditor || !this.#focusedCell || !this.#chromeHost) {
			return;
		}
		const nativeCell = this.#getNativeCellElement(this.#focusedCell.row, this.#focusedCell.col);
		const wrapper = this.#chromeHost.parentElement;
		if (!nativeCell || !(wrapper instanceof HTMLElement)) {
			return;
		}
		const cellRect = nativeCell.getBoundingClientRect();
		const wrapperRect = wrapper.getBoundingClientRect();
		const cellStyle = getComputedStyle(nativeCell);
		const width = nativeCell.clientWidth;
		// Use the padding box (client*): with border-collapse, borderTopWidth is
		// often 1px while clientTop is 0, and adding the border to padding shifted
		// the edit text down by a pixel.
		this.#cellEditor.style.left = `${cellRect.left - wrapperRect.left + wrapper.scrollLeft + nativeCell.clientLeft}px`;
		this.#cellEditor.style.top = `${cellRect.top - wrapperRect.top + wrapper.scrollTop + nativeCell.clientTop}px`;
		this.#cellEditor.style.width = `${width}px`;
		this.#cellEditor.style.paddingTop = cellStyle.paddingTop;
		this.#cellEditor.style.paddingRight = cellStyle.paddingRight;
		this.#cellEditor.style.paddingBottom = cellStyle.paddingBottom;
		this.#cellEditor.style.paddingLeft = cellStyle.paddingLeft;
		this.#cellWidth.set(Math.max(40, width), undefined);

		const widthChanged = Math.round(width) !== this.#cellFitWidth;
		if (remeasure || widthChanged || this.#cellFitHeight === 0) {
			this.#fitCellEditorHeight(nativeCell);
			return;
		}
		this.#applyCellEditorHeight(this.#cellFitHeight);
	}

	/**
	 * Keep one-line cells at preview height. Grow only when the paragraph wraps.
	 */
	#fitCellEditorHeight(nativeCell: HTMLTableCellElement): void {
		const editor = this.#cellEditor;
		if (!editor) {
			return;
		}
		this.#fittingCellHeight = true;
		try {
			if (this.#cellPreviewHeight === 0) {
				this.#cellPreviewHeight = nativeCell.clientHeight;
			}
			editor.style.height = 'auto';
			editor.style.minHeight = '0';
			editor.style.maxHeight = 'none';
			const paragraph = editor.querySelector('.md-paragraph');
			const padTop = Number.parseFloat(editor.style.paddingTop) || 0;
			const padBottom = Number.parseFloat(editor.style.paddingBottom) || 0;
			let needed = this.#cellPreviewHeight;
			if (paragraph instanceof HTMLElement) {
				const style = getComputedStyle(paragraph);
				const fontSize = Number.parseFloat(style.fontSize) || 16;
				const parsedLine = Number.parseFloat(style.lineHeight);
				const lineHeight = Number.isFinite(parsedLine) ? parsedLine : fontSize * 1.2;
				const textHeight = paragraph.getBoundingClientRect().height;
				if (textHeight > lineHeight * 1.35) {
					needed = Math.max(this.#cellPreviewHeight, Math.ceil(textHeight + padTop + padBottom));
				}
			}
			this.#cellFitWidth = Math.round(nativeCell.clientWidth);
			this.#cellFitHeight = needed;
			this.#applyCellEditorHeight(needed);
			if (needed <= 1 && !this.#cellFitRetry) {
				this.#cellFitRetry = true;
				requestAnimationFrame(() => this.#syncCellEditorLayout(true));
			}
		} finally {
			this.#fittingCellHeight = false;
		}
	}

	#applyCellEditorHeight(height: number): void {
		const editor = this.#cellEditor;
		const nativeRow = this.#hiddenNativeCell?.parentElement;
		if (!editor) {
			return;
		}
		const value = `${height}px`;
		editor.style.height = value;
		editor.style.minHeight = value;
		editor.style.maxHeight = value;
		const growRow = this.#cellPreviewHeight > 0 && height > this.#cellPreviewHeight + 1;
		if (nativeRow instanceof HTMLTableRowElement) {
			for (const cell of nativeRow.cells) {
				cell.style.height = growRow ? value : '';
			}
		}
	}

	#clearForcedRowHeights(): void {
		const nativeRow = this.#hiddenNativeCell?.parentElement;
		if (nativeRow instanceof HTMLTableRowElement) {
			for (const cell of nativeRow.cells) {
				cell.style.height = '';
			}
		}
		this.#cellFitWidth = 0;
		this.#cellFitHeight = 0;
		this.#cellPreviewHeight = 0;
		this.#cellFitRetry = false;
	}

	#commitFocusedCell(): void {
		if (!this.#focusedCell || !this.#cellModel) {
			return;
		}
		const { row, col } = this.#focusedCell;
		while (this.#rows.length <= row) {
			const colCount = Math.max(1, this.#rows[0]?.length ?? col + 1);
			this.#rows.push(Array.from({ length: colCount }, () => ''));
		}
		const rowCells = this.#rows[row]!;
		while (rowCells.length <= col) {
			rowCells.push('');
		}
		const text = this.#cellModel.sourceText.get().value;
		if (rowCells[col] !== text) {
			rowCells[col] = text;
			this.#dirty = true;
		}
	}

	#removeCellEditor(): void {
		this.#commitFocusedCell();
		this.#cellLayoutSub?.dispose();
		this.#cellLayoutSub = undefined;
		this.#editContextSuspend?.dispose();
		this.#editContextSuspend = undefined;
		this.#clearForcedRowHeights();
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
		this.#commitFocusedCell();
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
		this.#clearAxisSelection();
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
		this.#clearAxisSelection();
		const index = this.#insertColIndex;
		const inserted = insertColumn(this.#rows, this.#alignments, index);
		this.#rows = inserted.rows;
		this.#alignments = inserted.alignments;
		this.#dirty = true;
		this.#focusedCell = { row: Math.min(this.#focusedCell?.row ?? 0, this.#rows.length - 1), col: index };
		this.#insertColIndex = index + 1;
		this.#applyTableChange(true);
	}

	#selectAxis(kind: 'row' | 'col', index: number): void {
		if (kind === 'row' && (index <= 0 || this.#rows.length <= 1)) {
			return;
		}
		if (kind === 'col' && (this.#rows[0]?.length ?? 0) <= 1) {
			return;
		}
		this.#removeCellEditor();
		this.#focusedCell = undefined;
		this.#selectedAxis = { kind, index };
		if (this.#dirty) {
			this.#applyTableChange(true);
			return;
		}
		this.#view.element.focus();
		this.#positionInsertAffordance();
	}

	#clearAxisSelection(): void {
		if (!this.#selectedAxis) {
			return;
		}
		this.#selectedAxis = undefined;
		this.#chromeHost?.classList.remove('ib-table-grid-axis-row', 'ib-table-grid-axis-col');
		if (this.#selectionBand) {
			this.#selectionBand.style.opacity = '0';
		}
	}

	#deleteSelection(): void {
		const selected = this.#selectedAxis;
		if (!selected) {
			return;
		}
		if (selected.kind === 'row') {
			this.#deleteRow(selected.index);
			return;
		}
		this.#deleteColumn(selected.index);
	}

	#deleteRow(index: number): void {
		if (this.#activeTableOffset === undefined || this.#isRemounting || index <= 0 || this.#rows.length <= 1) {
			return;
		}
		this.#removeCellEditor();
		this.#rows = deleteRow(this.#rows, index);
		this.#dirty = true;
		const nextIndex = Math.min(index, this.#rows.length - 1);
		if (this.#rows.length > 1 && nextIndex > 0) {
			this.#selectedAxis = { kind: 'row', index: nextIndex };
			this.#focusedCell = undefined;
		} else {
			this.#selectedAxis = undefined;
			this.#focusedCell = { row: Math.max(0, nextIndex), col: 0 };
		}
		this.#applyTableChange(true);
	}

	#deleteColumn(index: number): void {
		const colCount = this.#rows[0]?.length ?? 0;
		if (this.#activeTableOffset === undefined || this.#isRemounting || colCount <= 1) {
			return;
		}
		this.#removeCellEditor();
		const deleted = deleteColumn(this.#rows, this.#alignments, index);
		this.#rows = deleted.rows;
		this.#alignments = deleted.alignments;
		this.#dirty = true;
		const nextCount = this.#rows[0]?.length ?? 0;
		const nextIndex = Math.min(index, Math.max(0, nextCount - 1));
		if (nextCount > 1) {
			this.#selectedAxis = { kind: 'col', index: nextIndex };
			this.#focusedCell = undefined;
		} else {
			this.#selectedAxis = undefined;
			this.#focusedCell = { row: Math.min(this.#focusedCell?.row ?? 0, this.#rows.length - 1), col: nextIndex };
		}
		this.#applyTableChange(true);
	}

	#applyTableChange(remount: boolean): void {
		if (this.#activeTableOffset === undefined || this.#isRemounting) {
			return;
		}
		this.#commitFocusedCell();
		const table = this.#resolveActiveTable();
		if (!table) {
			return;
		}
		const focus = this.#focusedCell;
		const axis = this.#selectedAxis;
		if (remount) {
			this.#isRemounting = true;
		}
		applyTableData(this.#model, table, this.#rows, this.#alignments);
		this.#dirty = false;
		const updated = this.#resolveActiveTable();
		if (updated) {
			this.#refreshActiveOffset(updated);
			// Keep live cell-editor text when not remounting; reloading here could
			// blank a newly inserted cell before exit flushes the editor.
			if (!this.#cellModel) {
				this.#loadFromTable(updated);
			}
		}
		if (!remount) {
			return;
		}
		requestAnimationFrame(() => requestAnimationFrame(() => {
			this.#isRemounting = false;
			if (this.#activeTableOffset === undefined) {
				return;
			}
			this.#tearDownGridDom();
			this.#mountChrome();
			if (axis) {
				this.#selectedAxis = axis;
				this.#positionInsertAffordance();
				this.#view.element.focus();
				return;
			}
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

	#updateInsertFromPoint(clientX: number, clientY: number): void {
		const geo = this.#getGridGeometry();
		if (!geo) {
			return;
		}
		this.#insertRowIndex = this.#nearestStop(geo.rowStops, clientY);
		this.#insertColIndex = this.#nearestStop(geo.colStops, clientX);
		this.#chromeHost?.classList.remove('ib-table-grid-preview-row', 'ib-table-grid-preview-col');
		this.#positionInsertAffordance(geo);
	}

	#updateInsertFromFocus(): void {
		const colCount = this.#rows[0]?.length ?? 0;
		this.#insertRowIndex = this.#focusedCell ? this.#focusedCell.row + 1 : this.#rows.length;
		this.#insertColIndex = this.#focusedCell ? this.#focusedCell.col + 1 : colCount;
		this.#positionInsertAffordance();
	}

	#positionInsertAffordance(geo = this.#getGridGeometry()): void {
		if (!geo || !this.#addRowButton || !this.#addColButton || !this.#insertRowLine || !this.#insertColLine) {
			return;
		}
		this.#insertRowIndex = Math.max(0, Math.min(this.#insertRowIndex, geo.rowStops.length - 1));
		this.#insertColIndex = Math.max(0, Math.min(this.#insertColIndex, geo.colStops.length - 1));
		const rowY = geo.rowStops[this.#insertRowIndex]!;
		const colX = geo.colStops[this.#insertColIndex]!;
		const { wrapper, wrapperRect, tableRect } = geo;
		const x = (client: number): number => client - wrapperRect.left + wrapper.scrollLeft;
		const y = (client: number): number => client - wrapperRect.top + wrapper.scrollTop;

		const addSize = 22;
		this.#addRowButton.style.top = `${y(rowY) - addSize / 2}px`;
		this.#addRowButton.style.left = `${x(tableRect.left) - addSize / 2}px`;
		this.#addColButton.style.left = `${x(colX) - addSize / 2}px`;
		this.#addColButton.style.top = `${y(tableRect.top) - addSize / 2}px`;

		this.#insertRowLine.style.left = `${x(tableRect.left)}px`;
		this.#insertRowLine.style.top = `${y(rowY)}px`;
		this.#insertRowLine.style.width = `${tableRect.width}px`;
		this.#insertColLine.style.top = `${y(tableRect.top)}px`;
		this.#insertColLine.style.left = `${x(colX)}px`;
		this.#insertColLine.style.height = `${tableRect.height}px`;

		this.#addRowButton.title = this.#insertGapLabel('row', this.#insertRowIndex, geo.rowStops.length - 1);
		this.#addRowButton.setAttribute('aria-label', this.#addRowButton.title);
		this.#addColButton.title = this.#insertGapLabel('column', this.#insertColIndex, geo.colStops.length - 1);
		this.#addColButton.setAttribute('aria-label', this.#addColButton.title);

		this.#syncGapDots(
			this.#rowDotHost,
			'ib-table-grid-gap-dot-row',
			geo.rowStops,
			index => ({
				left: x(tableRect.left),
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
				top: y(tableRect.top),
			}),
			this.#chromeHost?.classList.contains('ib-table-grid-preview-col') ? this.#insertColIndex : -1,
		);
		this.#syncAxisHandles(geo.rowStops, geo.colStops, x, y, tableRect);
		this.#syncSelectionBand(geo.rowStops, geo.colStops, x, y, tableRect);
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

	#syncAxisHandles(
		rowStops: readonly number[],
		colStops: readonly number[],
		x: (client: number) => number,
		y: (client: number) => number,
		tableRect: DOMRect,
	): void {
		const handle = 10;
		const inset = 8;
		const rowCount = Math.max(0, rowStops.length - 1);
		const colCount = Math.max(0, colStops.length - 1);
		this.#syncHandleCount(this.#rowHandleHost, 'ib-table-grid-row-handle', this.#rows.length > 1 ? Math.max(0, rowCount - 1) : 0);
		this.#syncHandleCount(this.#colHandleHost, 'ib-table-grid-col-handle', colCount > 1 ? colCount : 0);
		if (this.#rowHandleHost) {
			for (let i = 0; i < this.#rowHandleHost.childElementCount; i++) {
				const el = this.#rowHandleHost.children[i];
				if (!(el instanceof HTMLElement)) {
					continue;
				}
				const row = i + 1;
				const top = y(rowStops[row]!) + inset;
				const bottom = y(rowStops[row + 1]!) - inset;
				el.dataset.index = String(row);
				el.style.left = `${x(tableRect.left) - handle / 2}px`;
				el.style.top = `${top}px`;
				el.style.width = `${handle}px`;
				el.style.height = `${Math.max(4, bottom - top)}px`;
				el.title = `Select row ${row + 1}`;
				el.setAttribute('aria-label', el.title);
			}
		}
		if (this.#colHandleHost) {
			for (let i = 0; i < this.#colHandleHost.childElementCount; i++) {
				const el = this.#colHandleHost.children[i];
				if (!(el instanceof HTMLElement)) {
					continue;
				}
				const left = x(colStops[i]!) + inset;
				const right = x(colStops[i + 1]!) - inset;
				el.dataset.index = String(i);
				el.style.left = `${left}px`;
				el.style.top = `${y(tableRect.top) - handle / 2}px`;
				el.style.width = `${Math.max(4, right - left)}px`;
				el.style.height = `${handle}px`;
				el.title = `Select column ${i + 1}`;
				el.setAttribute('aria-label', el.title);
			}
		}
	}

	#syncHandleCount(host: HTMLElement | undefined, className: string, count: number): void {
		if (!host) {
			return;
		}
		while (host.childElementCount > count) {
			host.lastElementChild?.remove();
		}
		while (host.childElementCount < count) {
			const button = document.createElement('button');
			button.type = 'button';
			button.className = className;
			button.tabIndex = -1;
			host.appendChild(button);
		}
	}

	#syncSelectionBand(
		rowStops: readonly number[],
		colStops: readonly number[],
		x: (client: number) => number,
		y: (client: number) => number,
		tableRect: DOMRect,
	): void {
		const band = this.#selectionBand;
		const selected = this.#selectedAxis;
		this.#chromeHost?.classList.toggle('ib-table-grid-axis-row', selected?.kind === 'row');
		this.#chromeHost?.classList.toggle('ib-table-grid-axis-col', selected?.kind === 'col');
		if (!band || !selected) {
			if (band) {
				band.style.opacity = '0';
			}
			return;
		}
		if (selected.kind === 'row') {
			const top = y(rowStops[selected.index]!);
			const bottom = y(rowStops[selected.index + 1] ?? rowStops[selected.index]!);
			band.style.left = `${x(tableRect.left)}px`;
			band.style.top = `${top}px`;
			band.style.width = `${tableRect.width}px`;
			band.style.height = `${Math.max(0, bottom - top)}px`;
		} else {
			const left = x(colStops[selected.index]!);
			const right = x(colStops[selected.index + 1] ?? colStops[selected.index]!);
			band.style.left = `${left}px`;
			band.style.top = `${y(tableRect.top)}px`;
			band.style.width = `${Math.max(0, right - left)}px`;
			band.style.height = `${tableRect.height}px`;
		}
		band.style.opacity = '1';
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
		this.#clearColumnWidths(this.#nativeTable);
		this.#nativeTable = undefined;
		this.#addRowButton = undefined;
		this.#addColButton = undefined;
		this.#insertRowLine = undefined;
		this.#insertColLine = undefined;
		this.#rowDotHost = undefined;
		this.#colDotHost = undefined;
		this.#rowHandleHost = undefined;
		this.#colHandleHost = undefined;
		this.#selectionBand = undefined;

		const wrapper = this.#chromeHost?.parentElement;
		this.#chromeHost?.remove();
		this.#chromeHost = undefined;
		wrapper?.classList.remove('ib-table-grid-active');
		if (wrapper instanceof HTMLElement) {
			wrapper.style.position = '';
		}
	}
}
