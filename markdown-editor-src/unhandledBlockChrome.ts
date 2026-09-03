/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import {
	EditorView,
	type BlockAstNode,
	type BlockMeasurement,
} from '@vscode/markdown-editor';
import { Disposable, autorun } from '@vscode/observables';

const LINK_DEFINITION_CLASS = 'ib-md-link-definition';
const IMAGE_FALLBACK_CLASS = 'ib-md-image-fallback';
const IMAGE_BROKEN_CLASS = 'ib-md-image-broken';
const IMAGE_BOUND_ATTR = 'data-ib-image-bound';

interface UnhandledFields {
	readonly tokenType?: string;
}

/**
 * Soften link-reference definitions (micromark `definition` tokens) so they
 * do not look like parse errors, and paint a readable alt fallback when an
 * `<img>` fails to load.
 */
export class UnhandledBlockChromeController extends Disposable {
	readonly #view: EditorView;

	constructor(view: EditorView) {
		super();
		this.#view = view;

		this._register(autorun((reader) => {
			const measurements = reader.readObservable(this.#view.measuredLayout.measurements);
			this.#syncDefinitions(measurements);
			this.#syncImages();
		}));
	}

	#syncDefinitions(measurements: readonly BlockMeasurement[]): void {
		const seen = new Set<HTMLElement>();
		for (const measurement of measurements) {
			const block = measurement.block;
			if (!isLinkDefinitionBlock(block)) {
				continue;
			}
			const el = measurement.viewNode?.dom;
			if (!(el instanceof HTMLElement)) {
				continue;
			}
			el.classList.add(LINK_DEFINITION_CLASS);
			seen.add(el);
		}

		for (const el of this.#view.element.querySelectorAll(`.${LINK_DEFINITION_CLASS}`)) {
			if (el instanceof HTMLElement && !seen.has(el)) {
				el.classList.remove(LINK_DEFINITION_CLASS);
			}
		}
	}

	#syncImages(): void {
		for (const node of this.#view.element.querySelectorAll(`img:not([${IMAGE_BOUND_ATTR}])`)) {
			if (!(node instanceof HTMLImageElement)) {
				continue;
			}
			node.setAttribute(IMAGE_BOUND_ATTR, '');
			const onError = (): void => markBrokenImage(node);
			const onLoad = (): void => clearBrokenImage(node);
			node.addEventListener('error', onError);
			node.addEventListener('load', onLoad);
			if (node.complete && node.naturalWidth === 0 && node.getAttribute('src')) {
				markBrokenImage(node);
			}
		}

		for (const fallback of [...this.#view.element.querySelectorAll(`.${IMAGE_FALLBACK_CLASS}`)]) {
			const img = fallback.previousElementSibling;
			if (!(img instanceof HTMLImageElement) || !img.classList.contains(IMAGE_BROKEN_CLASS)) {
				fallback.remove();
			}
		}
	}
}

function isLinkDefinitionBlock(block: BlockAstNode): boolean {
	if (block.kind !== 'unhandledBlock') {
		return false;
	}
	return (block as BlockAstNode & UnhandledFields).tokenType === 'definition';
}

function markBrokenImage(img: HTMLImageElement): void {
	img.classList.add(IMAGE_BROKEN_CLASS);
	const existing = img.nextElementSibling;
	if (existing instanceof HTMLElement && existing.classList.contains(IMAGE_FALLBACK_CLASS)) {
		existing.textContent = img.alt || 'Broken image';
		return;
	}
	const fallback = document.createElement('span');
	fallback.className = IMAGE_FALLBACK_CLASS;
	fallback.textContent = img.alt || 'Broken image';
	if (img.src) {
		fallback.title = img.src;
	}
	img.insertAdjacentElement('afterend', fallback);
}

function clearBrokenImage(img: HTMLImageElement): void {
	img.classList.remove(IMAGE_BROKEN_CLASS);
	const existing = img.nextElementSibling;
	if (existing instanceof HTMLElement && existing.classList.contains(IMAGE_FALLBACK_CLASS)) {
		existing.remove();
	}
}
