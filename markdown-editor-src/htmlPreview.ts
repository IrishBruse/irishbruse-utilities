/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import {
	EditorModel,
	EditorView,
	Selection,
	findNodeOffsetById,
	type BlockAstNode,
	type BlockMeasurement,
} from '@vscode/markdown-editor';
import { Disposable, autorun } from '@vscode/observables';
import { sanitizeHtml } from './htmlSanitize';

const PREVIEW_CLASS = 'ib-html-preview';
const RENDERED_CLASS = 'ib-html-rendered';

interface HtmlFlowFields {
	readonly tokenType?: string;
	readonly htmlComment?: unknown;
	readonly code?: { readonly content: string };
}

interface HtmlPreviewEntry {
	readonly element: HTMLElement;
	source: string;
	offset: number;
}

/**
 * Paint sanitized HTML for inactive `htmlFlow` blocks. The native source
 * `<pre>` stays in the DOM for mapping; CSS takes it out of flow until the
 * caret enters the block.
 */
export class HtmlPreviewController extends Disposable {
	readonly #model: EditorModel;
	readonly #view: EditorView;
	readonly #onOpenLink: (url: string) => void;
	readonly #previews = new Map<number, HtmlPreviewEntry>();

	constructor(model: EditorModel, view: EditorView, onOpenLink: (url: string) => void) {
		super();
		this.#model = model;
		this.#view = view;
		this.#onOpenLink = onOpenLink;

		this.#view.element.addEventListener('pointerdown', this.#onPointerDown, true);
		this._register({ dispose: () => this.#view.element.removeEventListener('pointerdown', this.#onPointerDown, true) });
		this.#view.element.addEventListener('click', this.#onClick, true);
		this._register({ dispose: () => this.#view.element.removeEventListener('click', this.#onClick, true) });

		this._register(autorun((reader) => {
			reader.readObservable(this.#model.document);
			reader.readObservable(this.#model.sourceText);
			const measurements = reader.readObservable(this.#view.measuredLayout.measurements);
			const activeBlocks = reader.readObservable(this.#model.activeBlocks);
			const readonly = reader.readObservable(this.#model.readonlyMode);
			this.#sync(measurements, activeBlocks, readonly);
		}));
		this._register({ dispose: () => this.#clearAll() });
	}

	#sync(
		measurements: readonly BlockMeasurement[],
		activeBlocks: ReadonlySet<BlockAstNode>,
		readonly: boolean,
	): void {
		const doc = this.#model.document.get();
		const seen = new Set<number>();

		for (const measurement of measurements) {
			const block = measurement.block;
			if (!isHtmlFlowBlock(block)) {
				continue;
			}
			const wrapper = getUnhandledWrapper(measurement);
			if (!wrapper) {
				continue;
			}
			if (!readonly && activeBlocks.has(block)) {
				this.#detach(block.id, wrapper);
				continue;
			}
			seen.add(block.id);
			const offset = findNodeOffsetById(doc, block) ?? measurement.absoluteStart;
			this.#attach(wrapper, block.id, htmlSource(block), offset);
		}

		for (const id of [...this.#previews.keys()]) {
			if (!seen.has(id)) {
				this.#detach(id);
			}
		}
	}

	#attach(wrapper: HTMLElement, id: number, source: string, offset: number): void {
		let entry = this.#previews.get(id);
		if (entry && entry.element.parentElement !== wrapper) {
			entry.element.remove();
			entry = undefined;
		}
		if (!entry) {
			const element = document.createElement('div');
			element.className = PREVIEW_CLASS;
			entry = { element, source: '', offset };
			this.#previews.set(id, entry);
		}
		entry.offset = offset;
		if (entry.source !== source) {
			entry.source = source;
			entry.element.innerHTML = sanitizeHtml(source);
		}
		if (entry.element.parentElement !== wrapper) {
			wrapper.insertBefore(entry.element, wrapper.firstChild);
		}
		wrapper.classList.add(RENDERED_CLASS);
	}

	#detach(id: number, wrapper?: HTMLElement): void {
		const entry = this.#previews.get(id);
		const host = wrapper ?? entry?.element.parentElement;
		entry?.element.remove();
		this.#previews.delete(id);
		if (host instanceof HTMLElement) {
			host.classList.remove(RENDERED_CLASS);
		}
	}

	#clearAll(): void {
		for (const id of [...this.#previews.keys()]) {
			this.#detach(id);
		}
	}

	#previewFromEvent(event: Event): HtmlPreviewEntry | undefined {
		const target = event.target;
		if (!(target instanceof Element)) {
			return undefined;
		}
		const preview = target.closest(`.${PREVIEW_CLASS}`);
		if (!(preview instanceof HTMLElement) || !this.#view.element.contains(preview)) {
			return undefined;
		}
		for (const entry of this.#previews.values()) {
			if (entry.element === preview) {
				return entry;
			}
		}
		return undefined;
	}

	#anchorInPreview(event: Event, preview: HTMLElement): HTMLAnchorElement | undefined {
		const target = event.target;
		if (!(target instanceof Element)) {
			return undefined;
		}
		const anchor = target.closest('a');
		return anchor instanceof HTMLAnchorElement && preview.contains(anchor) ? anchor : undefined;
	}

	readonly #onPointerDown = (event: PointerEvent): void => {
		const entry = this.#previewFromEvent(event);
		if (!entry) {
			return;
		}
		const anchor = this.#anchorInPreview(event, entry.element);
		if (anchor) {
			event.preventDefault();
			event.stopPropagation();
			return;
		}
		if (this.#model.readonlyMode.get()) {
			return;
		}
		event.preventDefault();
		event.stopPropagation();
		this.#view.element.focus();
		this.#model.selection.set(Selection.collapsed(entry.offset), undefined);
	};

	readonly #onClick = (event: MouseEvent): void => {
		const entry = this.#previewFromEvent(event);
		if (!entry) {
			return;
		}
		const anchor = this.#anchorInPreview(event, entry.element);
		if (!anchor) {
			return;
		}
		event.preventDefault();
		event.stopPropagation();
		const href = anchor.getAttribute('href');
		if (href) {
			this.#onOpenLink(href);
		}
	};
}

function isHtmlFlowBlock(block: BlockAstNode): boolean {
	if (block.kind !== 'unhandledBlock') {
		return false;
	}
	const fields = block as BlockAstNode & HtmlFlowFields;
	return fields.tokenType === 'htmlFlow' && fields.htmlComment === undefined;
}

function htmlSource(block: BlockAstNode): string {
	const code = (block as BlockAstNode & HtmlFlowFields).code;
	return code?.content ?? '';
}

function getUnhandledWrapper(measurement: BlockMeasurement): HTMLElement | undefined {
	const dom = measurement.viewNode?.dom;
	if (!(dom instanceof HTMLElement) || !dom.classList.contains('md-unhandled-block')) {
		return undefined;
	}
	return dom;
}
