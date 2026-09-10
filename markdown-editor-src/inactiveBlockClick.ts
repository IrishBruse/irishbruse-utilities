/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import {
	CodeBlockAstNode,
	EditorModel,
	EditorView,
	Selection,
	findNodeOffsetById,
} from '@vscode/markdown-editor';
import { Disposable } from '@vscode/observables';

/**
 * Inactive custom code blocks (Mermaid preview) and empty editor padding do not
 * map through the stock DOM hit test. Route those clicks into the source model.
 */
export class InactiveBlockClickController extends Disposable {
	readonly #model: EditorModel;
	readonly #view: EditorView;

	constructor(model: EditorModel, view: EditorView) {
		super();
		this.#model = model;
		this.#view = view;
		this.#view.element.addEventListener('pointerdown', this.#onPointerDown, true);
		this._register({ dispose: () => this.#view.element.removeEventListener('pointerdown', this.#onPointerDown, true) });
	}

	readonly #onPointerDown = (event: PointerEvent): void => {
		if (event.button !== 0 || this.#model.readonlyMode.get()) {
			return;
		}
		const target = event.target;
		if (!(target instanceof Element)) {
			return;
		}
		if (target.closest('.ib-mermaid-open-preview, .ib-html-preview, .md-table-wrapper, .ib-table-grid-overlay')) {
			return;
		}
		if (target.closest('a[href], [data-md-url], summary')) {
			return;
		}

		const mermaidRoot = target.closest('.md-code-block:not(.md-block-active) .md-mermaid');
		if (mermaidRoot instanceof HTMLElement) {
			const block = this.#codeBlockFromDom(mermaidRoot);
			if (block) {
				event.preventDefault();
				event.stopPropagation();
				this.#focusCodeBlock(block);
				return;
			}
		}

		const point = { x: event.clientX, y: event.clientY };
		if (this.#view.isPointInContent(point)) {
			return;
		}
		if (!target.closest('.md-editor-content')) {
			return;
		}

		event.preventDefault();
		event.stopPropagation();
		this.#view.element.focus();
		this.#model.cancelPendingParagraph();
		const length = this.#model.sourceText.get().value.length;
		this.#model.selection.set(Selection.collapsed(length), undefined);
	};

	#codeBlockFromDom(node: HTMLElement): CodeBlockAstNode | undefined {
		const codeBlockEl = node.closest('.md-code-block');
		if (!(codeBlockEl instanceof HTMLElement)) {
			return undefined;
		}
		for (const measurement of this.#view.measuredLayout.measurements.get()) {
			const block = measurement.block;
			if (block instanceof CodeBlockAstNode && measurement.viewNode?.dom === codeBlockEl) {
				return block;
			}
		}
		return undefined;
	}

	#focusCodeBlock(block: CodeBlockAstNode): void {
		const offset = findNodeOffsetById(this.#model.document.get(), block);
		if (offset === undefined) {
			return;
		}
		this.#view.element.focus();
		this.#model.cancelPendingParagraph();
		this.#model.selection.set(Selection.collapsed(offset + block.codeOffset), undefined);
	}
}
