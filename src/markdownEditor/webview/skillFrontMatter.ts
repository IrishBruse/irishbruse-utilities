/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import {
	EditorModel,
	EditorView,
	FrontMatterAstNode,
	OffsetRange,
	StringEdit,
	findNodeOffsetById,
	type BlockAstNode,
	type BlockMeasurement,
} from '@vscode/markdown-editor';
import { Disposable } from './disposable';
import { observeAll } from './observeAll';
import {
	completeSkillPropertyKeys,
	emptyProperty,
	parseSkillFrontMatter,
	serializeSkillFrontMatter,
	skillFrontMatterValueContent,
	widgetForKey,
	type SkillMapEntry,
	type SkillProperty,
} from './skillFrontMatterYaml';

/** Chords a text field handles itself, so they never reach the document editor. */
const FIELD_CHORD_KEYS = new Set([
	'a', 'c', 'v', 'x', 'z', 'y',
	'backspace', 'delete',
	'arrowleft', 'arrowright', 'arrowup', 'arrowdown',
	'home', 'end',
]);

const PANEL_CLASS = 'ib-skill-properties-panel';
const HOST_CLASS = 'ib-skill-properties';
const RENDERED_CLASS = 'ib-skill-properties-rendered';

export class SkillFrontMatterController extends Disposable {
	readonly #model: EditorModel;
	readonly #view: EditorView;
	readonly #host: HTMLElement;
	readonly #folderName: string;
	readonly #panel: HTMLElement;
	#properties: SkillProperty[] = [];
	#lastYaml: string | undefined;
	#collapsed = false;
	#addOpen = false;
	#addPrefix = '';
	#suggestionIndex = 0;
	#writeTimer: ReturnType<typeof setTimeout> | undefined;
	/** A field is focused, so the document edit waits until focus leaves it. */
	#deferredWrite = false;
	#writing = false;
	#pendingFocus: PendingFieldFocus | undefined;
	#pendingMapFocus: { mapKey: string; index: number } | undefined;

	constructor(model: EditorModel, view: EditorView, host: HTMLElement, folderName: string) {
		super();
		this.#model = model;
		this.#view = view;
		this.#host = host;
		this.#folderName = folderName;
		this.#panel = document.createElement('div');
		this.#panel.className = PANEL_CLASS;
		this.#panel.contentEditable = 'false';
		this.#panel.addEventListener('pointerdown', this.#onPanelPointerDown, true);
		this.#panel.addEventListener('pointerdown', event => event.stopPropagation());
		this.#panel.addEventListener('pointerup', event => event.stopPropagation());
		this.#panel.addEventListener('click', event => event.stopPropagation());
		this.#host.addEventListener('pointerdown', this.#onHostPointerDown);
		this.#panel.addEventListener('keydown', this.#onPanelKeyDown);
		this.#panel.addEventListener('beforeinput', event => event.stopPropagation());
		this.#panel.addEventListener('focusin', this.#rememberFocus);
		this.#panel.addEventListener('input', this.#rememberFocus);
		this.#panel.addEventListener('keyup', this.#rememberFocus);
		this.#panel.addEventListener('focusout', this.#forgetFocus);
		// Chromium's EditContext reclaims focus from fields inside the editor
		// after the first key, which drops the caret out of a metadata key.
		this._register(this.#view.suspendEditContextWhileFocused(this.#panel));

		observeAll(this._store, () => {
			this.#model.document.get();
			this.#model.sourceText.get();
			const measurements = this.#view.measuredLayout.measurements.get();
			this.#sync(measurements);
		}, this.#model.document, this.#model.sourceText, this.#view.measuredLayout.measurements, this.#model.readonlyMode);

		this._register({
			dispose: () => {
				this.#flushWrite();
				this.#host.removeEventListener('pointerdown', this.#onHostPointerDown);
				this.#panel.remove();
				this.#clearHost();
			},
		});
	}

	#sync(measurements: readonly BlockMeasurement[]): void {
		const block = this.#model.document.get().blocks.find((node): node is FrontMatterAstNode => node instanceof FrontMatterAstNode);
		if (!block) {
			this.#attachEmpty();
			if (this.#lastYaml === '') {
				return;
			}
			this.#lastYaml = '';
			this.#properties = [];
			this.#render();
			return;
		}

		const yaml = block.value?.content ?? '';
		const wrapper = frontMatterDom(measurements, block);
		if (wrapper) {
			this.#attachToBlock(wrapper);
		}
		if (yaml === this.#lastYaml) {
			return;
		}
		if (this.#panel.contains(document.activeElement)) {
			this.#lastYaml = yaml;
			return;
		}
		this.#lastYaml = yaml;
		this.#properties = parseSkillFrontMatter(yaml);
		this.#render();
	}

	#attachToBlock(wrapper: HTMLElement): void {
		this.#clearHost();
		this.#clearBlockRendered();
		if (this.#panel.parentElement !== wrapper) {
			wrapper.appendChild(this.#panel);
			this.#restoreFocus();
		}
		wrapper.classList.add(RENDERED_CLASS);
	}

	#attachEmpty(): void {
		this.#host.classList.add(HOST_CLASS);
		if (this.#panel.parentElement !== this.#host) {
			this.#host.insertBefore(this.#panel, this.#host.firstChild);
			this.#restoreFocus();
		}
		this.#clearBlockRendered();
	}

	readonly #rememberFocus = (event: Event): void => {
		const field = editableField(event.target);
		if (!field) {
			return;
		}
		const pending = pendingFieldFocus(field);
		if (!pending) {
			return;
		}
		this.#pendingFocus = pending;
		// A queued edit would rebuild the front matter block and drop this caret.
		if (this.#writeTimer !== undefined) {
			clearTimeout(this.#writeTimer);
			this.#writeTimer = undefined;
			this.#deferredWrite = true;
		}
	};

	/**
	 * Forget the caret only when the user moves focus away. A rebuild of the
	 * front matter block detaches the field instead, and that focus has to come
	 * back once the panel is re-attached.
	 */
	readonly #forgetFocus = (event: FocusEvent): void => {
		// A document write detaches the field or moves focus to the editor.
		// Keep the caret so it can be put back on the same key or value.
		if (this.#writing) {
			return;
		}
		const next = event.relatedTarget;
		if (next instanceof Node && this.#panel.contains(next)) {
			return;
		}
		const field = editableField(event.target);
		if (field?.isConnected) {
			this.#pendingFocus = undefined;
		}
		if (this.#deferredWrite) {
			this.#flushWrite();
		}
	};

	#restoreFocus(): void {
		const pending = this.#pendingFocus;
		if (!pending) {
			return;
		}
		const active = document.activeElement;
		if (active instanceof HTMLElement && active !== this.#panel && this.#panel.contains(active)) {
			return;
		}
		const field = editableField(this.#panel.querySelector(pending.focusSelector));
		if (!field) {
			return;
		}
		field.focus();
		const start = Math.min(pending.start, field.value.length);
		const end = Math.min(pending.end, field.value.length);
		field.setSelectionRange(start, end);
	}

	#clearHost(): void {
		this.#host.classList.remove(HOST_CLASS);
	}

	#clearBlockRendered(): void {
		for (const node of this.#view.element.querySelectorAll(`.${RENDERED_CLASS}`)) {
			if (node instanceof HTMLElement) {
				node.classList.remove(RENDERED_CLASS);
			}
		}
	}

	#render(): void {
		const readonly = this.#model.readonlyMode.get();
		const count = this.#properties.length;
		const suggestions = this.#addOpen ? this.#suggestions() : [];
		this.#suggestionIndex = Math.min(this.#suggestionIndex, Math.max(0, suggestions.length - 1));

		this.#panel.replaceChildren();
		this.#panel.classList.toggle('ib-skill-properties-collapsed', this.#collapsed);

		const toggle = document.createElement('button');
		toggle.type = 'button';
		toggle.className = 'ib-skill-properties-toggle';
		toggle.append(
			codicon(this.#collapsed ? 'chevron-right' : 'chevron-down'),
			textNode(' PROPERTIES '),
			span('ib-skill-properties-count', `(${count})`),
		);
		toggle.addEventListener('click', () => {
			this.#collapsed = !this.#collapsed;
			this.#addOpen = false;
			this.#render();
		});
		this.#panel.appendChild(toggle);

		if (this.#collapsed) {
			return;
		}

		const body = document.createElement('div');
		body.className = 'ib-skill-properties-body';
		for (const property of this.#properties) {
			body.appendChild(this.#row(property, readonly));
		}
		body.appendChild(this.#addRow(readonly, suggestions));
		this.#panel.appendChild(body);

		if (this.#focusPendingMapEntry()) {
			return;
		}
		if (this.#addOpen) {
			const input = this.#panel.querySelector('.ib-skill-properties-add-input');
			if (input instanceof HTMLInputElement) {
				input.focus();
				input.setSelectionRange(this.#addPrefix.length, this.#addPrefix.length);
			}
			return;
		}
		this.#restoreFocus();
	}

	#focusPendingMapEntry(): boolean {
		const pending = this.#pendingMapFocus;
		if (!pending) {
			return false;
		}
		this.#pendingMapFocus = undefined;
		const field = this.#panel.querySelector(
			`[data-map="${cssEscape(pending.mapKey)}"][data-index="${pending.index}"][data-part="key"]`,
		);
		if (!(field instanceof HTMLElement)) {
			return false;
		}
		field.focus();
		return true;
	}

	#row(property: SkillProperty, readonly: boolean): HTMLElement {
		if (property.kind === 'map') {
			return this.#mapBlock(property.key, property.entries, readonly);
		}
		const row = document.createElement('div');
		row.className = 'ib-skill-properties-row';
		row.append(span('ib-skill-properties-key', property.key));
		const widget = widgetForKey(property.key);
		if (property.kind === 'boolean' || widget === 'boolean') {
			const select = document.createElement('select');
			select.className = 'ib-skill-properties-value ib-skill-properties-select';
			select.disabled = readonly;
			select.dataset.key = property.key;
			for (const optionValue of [ 'true', 'false' ]) {
				const option = document.createElement('option');
				option.value = optionValue;
				option.textContent = optionValue;
				select.appendChild(option);
			}
			select.value = property.kind === 'boolean' && property.value ? 'true' : 'false';
			select.addEventListener('change', () => {
				this.#setProperty({ key: property.key, kind: 'boolean', value: select.value === 'true' });
			});
			row.appendChild(select);
			if (!readonly) {
				row.appendChild(this.#removeButton(`Remove ${property.key}`, () => this.#removeProperty(property.key)));
			}
			return row;
		}
		if (widget === 'multiline') {
			const textarea = document.createElement('textarea');
			textarea.className = 'ib-skill-properties-value ib-skill-properties-multiline';
			textarea.rows = 3;
			textarea.disabled = readonly;
			textarea.dataset.key = property.key;
			textarea.value = property.kind === 'string' ? property.value : '';
			textarea.addEventListener('input', () => {
				this.#setProperty({ key: property.key, kind: 'string', value: textarea.value });
			});
			row.appendChild(textarea);
			if (!readonly) {
				row.appendChild(this.#removeButton(`Remove ${property.key}`, () => this.#removeProperty(property.key)));
			}
			return row;
		}
		const input = document.createElement('input');
		input.type = 'text';
		input.className = 'ib-skill-properties-value';
		input.disabled = readonly;
		input.dataset.key = property.key;
		input.value = property.kind === 'string' ? property.value : '';
		if (property.key === 'name' && this.#folderName) {
			input.placeholder = this.#folderName;
		}
		input.addEventListener('input', () => {
			this.#setProperty({ key: property.key, kind: 'string', value: input.value });
		});
		row.appendChild(input);
		if (!readonly) {
			row.appendChild(this.#removeButton(`Remove ${property.key}`, () => this.#removeProperty(property.key)));
		}
		return row;
	}

	#mapBlock(key: string, entries: SkillMapEntry[], readonly: boolean): HTMLElement {
		const block = document.createElement('div');
		block.className = 'ib-skill-properties-map';
		const header = document.createElement('div');
		header.className = 'ib-skill-properties-row';
		header.append(span('ib-skill-properties-key', key));
		if (!readonly) {
			header.appendChild(this.#removeButton(`Remove ${key}`, () => this.#removeProperty(key)));
		}
		block.appendChild(header);
		entries.forEach((entry, index) => {
			const row = document.createElement('div');
			row.className = 'ib-skill-properties-row ib-skill-properties-nested';
			const keyInput = document.createElement('input');
			keyInput.type = 'text';
			keyInput.className = 'ib-skill-properties-map-key';
			keyInput.disabled = readonly;
			keyInput.placeholder = 'Key';
			keyInput.value = entry.key;
			keyInput.dataset.map = key;
			keyInput.dataset.index = String(index);
			keyInput.dataset.part = 'key';
			const valueInput = document.createElement('input');
			valueInput.type = 'text';
			valueInput.className = 'ib-skill-properties-value';
			valueInput.disabled = readonly;
			valueInput.placeholder = 'Value';
			valueInput.value = entry.value;
			valueInput.dataset.map = key;
			valueInput.dataset.index = String(index);
			valueInput.dataset.part = 'value';
			// Read both fields live. Closing over `entry` puts the other side
			// back to the value from the last render, so typing a metadata key
			// wiped the value (and the other way around).
			const writeEntry = (): void => {
				this.#setMapEntry(key, index, { key: keyInput.value, value: valueInput.value });
			};
			keyInput.addEventListener('input', writeEntry);
			valueInput.addEventListener('input', writeEntry);
			row.append(keyInput, valueInput);
			if (!readonly) {
				row.appendChild(this.#removeButton('Remove field', () => this.#removeMapEntry(key, index)));
			}
			block.appendChild(row);
		});
		if (!readonly) {
			const add = document.createElement('button');
			add.type = 'button';
			add.className = 'ib-skill-properties-add-nested';
			add.append(codicon('add'), textNode(' Add field'));
			add.addEventListener('click', () => {
				this.#setMapEntry(key, entries.length, { key: '', value: '' });
			});
			block.appendChild(add);
		}
		return block;
	}

	#addRow(readonly: boolean, suggestions: readonly string[]): HTMLElement {
		const row = document.createElement('div');
		row.className = 'ib-skill-properties-add';
		if (readonly) {
			return row;
		}
		if (!this.#addOpen) {
			row.appendChild(this.#addButton());
			return row;
		}

		const input = document.createElement('input');
		input.type = 'text';
		input.className = 'ib-skill-properties-add-input';
		input.placeholder = 'Property name';
		input.value = this.#addPrefix;
		input.setAttribute('aria-autocomplete', 'list');
		input.setAttribute('aria-expanded', 'true');
		input.addEventListener('input', () => {
			this.#addPrefix = input.value;
			this.#suggestionIndex = 0;
			this.#render();
		});
		input.addEventListener('focusout', event => {
			if (!input.isConnected || !this.#addOpen) {
				return;
			}
			const next = event.relatedTarget;
			if (next instanceof Node && row.contains(next)) {
				return;
			}
			this.#dismissAdd();
		});
		row.appendChild(input);

		if (suggestions.length > 0 || this.#customAddKey()) {
			const list = document.createElement('ul');
			list.className = 'ib-skill-properties-suggestions';
			list.setAttribute('role', 'listbox');
			suggestions.forEach((key, index) => {
				list.appendChild(this.#suggestionItem(key, index === this.#suggestionIndex));
			});
			const custom = this.#customAddKey();
			if (custom) {
				list.appendChild(this.#suggestionItem(custom, this.#suggestionIndex === suggestions.length));
			}
			row.appendChild(list);
		}
		return row;
	}

	#suggestionItem(key: string, selected: boolean): HTMLElement {
		const item = document.createElement('li');
		item.className = 'ib-skill-properties-suggestion';
		item.classList.toggle('ib-skill-properties-suggestion-active', selected);
		item.setAttribute('role', 'option');
		item.textContent = key;
		item.addEventListener('pointerdown', event => {
			event.preventDefault();
			this.#commitAdd(key);
		});
		return item;
	}

	#suggestions(): string[] {
		return completeSkillPropertyKeys(this.#properties.map(property => property.key), this.#addPrefix.trim());
	}

	#customAddKey(): string | undefined {
		const key = this.#addPrefix.trim();
		if (!/^[A-Za-z0-9_-]+$/.test(key)) {
			return undefined;
		}
		if (this.#properties.some(property => property.key === key)) {
			return undefined;
		}
		if (this.#suggestions().includes(key)) {
			return undefined;
		}
		return key;
	}

	#onPanelKeyDown = (event: KeyboardEvent): void => {
		// Keystrokes must not reach the document editor underneath. Chords are
		// the exception: the field keeps the text-editing ones, and the rest
		// (Ctrl+S and friends) have to bubble out to the workbench.
		const chord = event.ctrlKey || event.metaKey || event.altKey;
		if (!chord || FIELD_CHORD_KEYS.has(event.key.toLowerCase())) {
			event.stopPropagation();
		}
		if (!this.#addOpen) {
			return;
		}
		if (event.key === 'Escape') {
			event.preventDefault();
			this.#dismissAdd();
			return;
		}
		const options = [ ...this.#suggestions(), this.#customAddKey() ].filter((key): key is string => !!key);
		if (event.key === 'ArrowDown' && options.length > 0) {
			event.preventDefault();
			this.#suggestionIndex = (this.#suggestionIndex + 1) % options.length;
			this.#render();
			return;
		}
		if (event.key === 'ArrowUp' && options.length > 0) {
			event.preventDefault();
			this.#suggestionIndex = (this.#suggestionIndex - 1 + options.length) % options.length;
			this.#render();
			return;
		}
		if ((event.key === 'Enter' || event.key === 'Tab') && options.length > 0) {
			event.preventDefault();
			const key = options[this.#suggestionIndex] ?? options[0];
			if (key) {
				this.#commitAdd(key);
			}
		}
	};

	#commitAdd(key: string): void {
		this.#addOpen = false;
		this.#addPrefix = '';
		this.#suggestionIndex = 0;
		const property = emptyProperty(key);
		if (property.kind === 'map') {
			this.#properties = [ ...this.#properties, { ...property, entries: [ { key: '', value: '' } ] } ];
			this.#pendingMapFocus = { mapKey: key, index: 0 };
		} else {
			this.#properties = [ ...this.#properties, property ];
		}
		this.#render();
		this.#queueWrite();
		if (property.kind === 'map') {
			return;
		}
		queueMicrotask(() => {
			const field = this.#panel.querySelector(`[data-key="${cssEscape(key)}"]`);
			if (field instanceof HTMLElement) {
				field.focus();
			}
		});
	}

	#setProperty(next: SkillProperty): void {
		this.#properties = this.#properties.map(property => property.key === next.key ? next : property);
		this.#queueWrite();
	}

	#setMapEntry(mapKey: string, index: number, entry: SkillMapEntry): void {
		let added = false;
		this.#properties = this.#properties.map(property => {
			if (property.key !== mapKey || property.kind !== 'map') {
				return property;
			}
			const entries = [ ...property.entries ];
			if (index >= entries.length) {
				entries.push(entry);
				added = true;
			} else {
				entries[index] = entry;
			}
			return { key: mapKey, kind: 'map', entries };
		});
		this.#queueWrite();
		if (added) {
			this.#pendingMapFocus = { mapKey, index };
			this.#render();
		}
	}

	#removeProperty(key: string): void {
		this.#properties = this.#properties.filter(property => property.key !== key);
		this.#pendingFocus = undefined;
		this.#render();
		this.#queueWrite();
	}

	#removeMapEntry(mapKey: string, index: number): void {
		this.#properties = this.#properties.map(property => {
			if (property.key !== mapKey || property.kind !== 'map') {
				return property;
			}
			return { key: mapKey, kind: 'map', entries: property.entries.filter((_, entryIndex) => entryIndex !== index) };
		});
		this.#render();
		this.#queueWrite();
	}

	#removeButton(label: string, onClick: () => void): HTMLButtonElement {
		const button = document.createElement('button');
		button.type = 'button';
		button.className = 'ib-skill-properties-remove';
		button.title = label;
		button.setAttribute('aria-label', label);
		button.append(codicon('close'));
		button.addEventListener('click', event => {
			event.preventDefault();
			event.stopPropagation();
			onClick();
		});
		return button;
	}

	#addButton(): HTMLButtonElement {
		const button = document.createElement('button');
		button.type = 'button';
		button.className = 'ib-skill-properties-add-button';
		button.append(codicon('add'), textNode(' Add property'));
		button.addEventListener('click', () => {
			this.#addOpen = true;
			this.#addPrefix = '';
			this.#suggestionIndex = 0;
			this.#render();
		});
		return button;
	}

	/**
	 * Close the add-property list without rebuilding the rest of the card, so
	 * the click that dismissed it still lands on the row or field under it.
	 */
	#dismissAdd(): void {
		if (!this.#addOpen) {
			return;
		}
		this.#addOpen = false;
		this.#addPrefix = '';
		this.#suggestionIndex = 0;
		const add = this.#panel.querySelector('.ib-skill-properties-add');
		if (add instanceof HTMLElement) {
			add.replaceChildren(this.#addButton());
		}
	}

	readonly #onPanelPointerDown = (event: PointerEvent): void => {
		if (!this.#addOpen) {
			return;
		}
		const add = this.#panel.querySelector('.ib-skill-properties-add');
		if (event.target instanceof Node && add?.contains(event.target)) {
			return;
		}
		this.#dismissAdd();
	};

	readonly #onHostPointerDown = (): void => {
		// Clicks inside the card never reach the host. A click outside is the
		// user leaving the field, so do not put the caret back after a write.
		this.#pendingFocus = undefined;
		this.#dismissAdd();
	};

	/**
	 * Coalesce a burst of keystrokes into one document edit. A timer, not
	 * `requestAnimationFrame`: an occluded webview never paints, and the edit
	 * still has to reach the document.
	 */
	#queueWrite(): void {
		if (this.#model.readonlyMode.get()) {
			return;
		}
		// Writing now rebuilds the front matter node and Chrome drops focus
		// after the first character. Keep the edit until the field blurs.
		if (this.#fieldFocused()) {
			this.#deferredWrite = true;
			if (this.#writeTimer !== undefined) {
				clearTimeout(this.#writeTimer);
				this.#writeTimer = undefined;
			}
			return;
		}
		if (this.#writeTimer !== undefined) {
			return;
		}
		this.#writeTimer = setTimeout(() => {
			this.#writeTimer = undefined;
			this.#write();
		}, 0);
	}

	#fieldFocused(): boolean {
		return editableField(document.activeElement) !== undefined && this.#panel.contains(document.activeElement);
	}

	#flushWrite(): void {
		const pending = this.#deferredWrite || this.#writeTimer !== undefined;
		this.#deferredWrite = false;
		if (this.#writeTimer !== undefined) {
			clearTimeout(this.#writeTimer);
			this.#writeTimer = undefined;
		}
		if (pending) {
			this.#write();
		}
	}

	#write(): void {
		this.#writing = true;
		try {
			this.#writeNow();
		} finally {
			this.#writing = false;
		}
		this.#restoreFocus();
	}

	#writeNow(): void {
		const yaml = serializeSkillFrontMatter(this.#properties);
		const doc = this.#model.document.get();
		const block = doc.blocks.find((node): node is FrontMatterAstNode => node instanceof FrontMatterAstNode);
		if (!block) {
			this.#lastYaml = `\n${yaml}`;
			this.#model.applyEdit(StringEdit.insert(0, wrapFrontMatter(yaml)));
			return;
		}
		const blockStart = findNodeOffsetById(doc, block);
		if (blockStart === undefined) {
			return;
		}
		const value = block.value;
		if (value) {
			const start = findNodeOffsetById(doc, value);
			if (start === undefined) {
				return;
			}
			const content = skillFrontMatterValueContent(yaml, value.content);
			this.#lastYaml = content;
			if (value.content === content) {
				return;
			}
			this.#model.applyEdit(StringEdit.replace(OffsetRange.ofStartAndLength(start, value.content.length), content));
			return;
		}
		const open = block.openFence;
		if (!open) {
			return;
		}
		this.#lastYaml = `\n${yaml}`;
		this.#model.applyEdit(StringEdit.insert(blockStart + open.content.length, `\n${yaml}`));
	}
}

interface PendingFieldFocus {
	readonly focusSelector: string;
	readonly start: number;
	readonly end: number;
}

function editableField(target: EventTarget | null): HTMLInputElement | HTMLTextAreaElement | undefined {
	return target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement ? target : undefined;
}

function pendingFieldFocus(field: HTMLInputElement | HTMLTextAreaElement): PendingFieldFocus | undefined {
	const start = field.selectionStart ?? 0;
	const end = field.selectionEnd ?? 0;
	if (field.dataset.key) {
		return { focusSelector: `[data-key="${cssEscape(field.dataset.key)}"]`, start, end };
	}
	const part = field.dataset.part;
	if (!field.dataset.map || field.dataset.index === undefined || (part !== 'key' && part !== 'value')) {
		return undefined;
	}
	return {
		focusSelector: `[data-map="${cssEscape(field.dataset.map)}"][data-index="${field.dataset.index}"][data-part="${part}"]`,
		start,
		end,
	};
}

function frontMatterDom(measurements: readonly BlockMeasurement[], block: BlockAstNode): HTMLElement | undefined {
	for (const measurement of measurements) {
		if (measurement.block === block && measurement.viewNode?.dom instanceof HTMLElement) {
			return measurement.viewNode.dom;
		}
	}
	return undefined;
}

function wrapFrontMatter(yaml: string): string {
	const body = yaml.endsWith('\n') || yaml.length === 0 ? yaml : `${yaml}\n`;
	return `---\n${body}---\n\n`;
}

function codicon(name: string): HTMLElement {
	const icon = document.createElement('span');
	icon.className = `codicon codicon-${name}`;
	icon.setAttribute('aria-hidden', 'true');
	return icon;
}

function span(className: string, value: string): HTMLElement {
	const node = document.createElement('span');
	node.className = className;
	node.textContent = value;
	return node;
}

function textNode(value: string): Text {
	return document.createTextNode(value);
}

function cssEscape(value: string): string {
	if (typeof CSS !== 'undefined' && typeof CSS.escape === 'function') {
		return CSS.escape(value);
	}
	return value.replace(/"/g, '\\"');
}
