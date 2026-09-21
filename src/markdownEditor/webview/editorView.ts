import { Disposable } from './disposable';
import { observeAll } from './react';
import {
	CodeBlockAstNode,
	EditorModel,
	HeadingAstNode,
	MdBlock,
	Selection,
	observableValue,
	type ISettableObservable,
} from '../core/index';
import {
	caretOffsetFromPoint,
	renderActiveSource,
	renderIdleBlock,
	resolveSourceOffset,
	type RenderOptions,
} from './renderBlocks';
import { headingBodyStart, headingDisplayText, headingSourceForEdit } from './activeSourceStyle';
import { activeBlockMinHeightPx } from './activeBlockLayout';
import {
	DEFAULT_VIEWPORT_HEIGHT_PX,
	VIRTUALIZE_AFTER_CHILDREN,
	planDocumentMount,
	setViewportBox,
	type MountChild,
	type ViewportBox,
} from './viewportVirtualization';

export interface BlockMeasurement {
	readonly block: MdBlock;
	readonly viewNode: BlockViewNode;
	readonly absoluteStart: number;
	readonly height: number;
	readonly isMeasured: boolean;
}

export class BlockViewNode {
	constructor(readonly element: HTMLElement, readonly ast: MdBlock) {}

	get dom(): HTMLElement {
		return this.element;
	}

	get scrollElement(): HTMLElement {
		return this.element;
	}
}

export class ViewNode {
	constructor(
		readonly element: HTMLElement,
		readonly sourceLength = 0,
	) {}

	get mountNode(): HTMLElement {
		return this.element;
	}

	resolveSource(pos: { node: Node; offset: number }): number | undefined {
		return resolveSourceOffset(pos.node, pos.offset);
	}

	static forDom(node: Node): ViewNode | undefined {
		const mapped = viewNodes.get(node);
		if (mapped) {
			return mapped;
		}
		if (node.parentNode) {
			return ViewNode.forDom(node.parentNode);
		}
		return undefined;
	}
}

const viewNodes = new WeakMap<Node, ViewNode>();

export interface SyntaxHighlightSession {
	readonly snapshot: ISettableObservable<{ tokens: readonly { length: number; className?: string }[] }>;
	update(text: string): void;
	dispose(): void;
}

export interface SyntaxHighlighter {
	create(languageId: string, initialText: string): SyntaxHighlightSession;
}

export interface EditorViewOptions {
	readonly classNames?: readonly string[];
	readonly syntaxHighlighter?: SyntaxHighlighter;
	readonly onOpenLink?: (href: string) => void;
	readonly onToggleCheckbox?: (item: unknown, checked: boolean) => void;
	readonly renderCustomCodeBlock?: (language: string, content: string) => HTMLElement | undefined;
	readonly showReadonlyToggle?: boolean;
	readonly limitedWidth?: ISettableObservable<number | undefined>;
	readonly idleBlockKinds?: readonly string[];
}

export class EditorView extends Disposable {
	readonly element: HTMLElement;
	readonly measuredLayout: {
		readonly measurements: ISettableObservable<readonly BlockMeasurement[]>;
	};
	readonly documentViewNode: ISettableObservable<ViewNode | undefined>;
	readonly #model: EditorModel;
	readonly #options: EditorViewOptions;
	readonly #content: HTMLElement;
	readonly #highlights = new Map<number, SyntaxHighlightSession>();
	#rebuildQueued = false;

	constructor(model: EditorModel, options: EditorViewOptions = {}) {
		super();
		this.#model = model;
		this.#options = options;
		this.element = document.createElement('div');
		this.element.className = ['md-editor', 'md-editor-content', ...(options.classNames ?? [])].join(' ');
		this.element.tabIndex = 0;
		this.element.setAttribute('role', 'textbox');
		this.element.setAttribute('aria-multiline', 'true');
		this.element.spellcheck = false;
		this.element.contentEditable = 'plaintext-only';
		if (this.element.contentEditable !== 'plaintext-only') {
			this.element.contentEditable = 'true';
		}
		this.#content = document.createElement('div');
		this.#content.className = 'md-document';
		this.element.append(this.#content);
		if (options.showReadonlyToggle !== false) {
			this.#mountReadonlyToggle();
		}
		this.measuredLayout = {
			measurements: observableValue('measurements', []),
		};
		this.documentViewNode = observableValue('documentViewNode', undefined);
		observeAll(this._store, () => this.#queueRebuild(), model.document, model.sourceText, model.activeBlocks, model.readonlyMode);
		model.selection.recomputeInitiallyAndOnChange(this._store, () => this.#syncDomSelection());
		if (options.limitedWidth) {
			observeAll(this._store, () => this.#applyLimitedWidth(), options.limitedWidth);
		}
		this.#queueRebuild();
		this._register({
			dispose: () => {
				for (const session of this.#highlights.values()) {
					session.dispose();
				}
				this.#highlights.clear();
			},
		});
	}

	focus(): void {
		this.element.focus({ preventScroll: true });
	}

	isPointInContent(point: { x: number; y: number }): boolean {
		for (const measurement of this.measuredLayout.measurements.get()) {
			const rect = measurement.viewNode.element.getBoundingClientRect();
			if (point.x >= rect.left && point.x <= rect.right && point.y >= rect.top && point.y <= rect.bottom) {
				return true;
			}
		}
		return false;
	}

	refreshEmbeddedCodeEditors(): void {
		this.#queueRebuild();
	}

	suspendEditContextWhileFocused(_element: HTMLElement): { dispose(): void } {
		return { dispose() {} };
	}

	offsetFromPointer(clientX: number, clientY: number): number | undefined {
		const mapped = caretOffsetFromPoint(this.element, clientX, clientY);
		if (mapped !== undefined) {
			return mapped;
		}
		return this.#offsetFromBlockHit(clientX, clientY);
	}

	#offsetFromBlockHit(clientX: number, clientY: number): number | undefined {
		for (const measurement of this.measuredLayout.measurements.get()) {
			const rect = measurement.viewNode.element.getBoundingClientRect();
			if (clientX < rect.left || clientX > rect.right || clientY < rect.top || clientY > rect.bottom) {
				continue;
			}
			if (measurement.block.kind === 'heading') {
				return this.#offsetFromHeadingHit(measurement, clientX);
			}
			const length = Math.max(0, measurement.block.length);
			if (length === 0 || rect.height <= 0) {
				return measurement.block.start;
			}
			const ratio = Math.min(1, Math.max(0, (clientY - rect.top) / rect.height));
			return measurement.block.start + Math.min(length, Math.floor(ratio * length));
		}
		return undefined;
	}

	#offsetFromHeadingHit(measurement: BlockMeasurement, clientX: number): number {
		const slice = this.#model.getText().slice(measurement.block.start, measurement.block.end);
		const body = headingDisplayText(slice);
		const inner = measurement.viewNode.element.querySelector('.md-heading, .md-active-source');
		const rect = (inner instanceof HTMLElement ? inner : measurement.viewNode.element).getBoundingClientRect();
		const ratio = rect.width <= 0 ? 0 : Math.min(1, Math.max(0, (clientX - rect.left) / rect.width));
		const displayed = Math.round(ratio * body.length);
		return measurement.block.start + headingBodyStart(slice) + displayed;
	}

	#applyLimitedWidth(): void {
		const width = this.#options.limitedWidth?.get();
		this.element.style.maxWidth = width ? `${width}px` : '';
	}

	#mountReadonlyToggle(): void {
		const button = document.createElement('button');
		button.type = 'button';
		button.className = 'md-readonly-toggle';
		button.title = 'Toggle read-only';
		const sync = (): void => {
			button.textContent = this.#model.readonlyMode.get() ? 'Unlock' : 'Lock';
		};
		this.#model.readonlyMode.recomputeInitiallyAndOnChange(this._store, sync);
		button.addEventListener('click', event => {
			event.preventDefault();
			event.stopPropagation();
			const nextReadonly = !this.#model.readonlyMode.get();
			this.#model.readonlyMode.set(nextReadonly, undefined);
			this.focus();
			if (!nextReadonly && !this.#model.selection.get()) {
				this.#model.selection.set(Selection.collapsed(0), undefined);
			}
		});
		this.element.append(button);
	}

	#queueRebuild(): void {
		if (this.#rebuildQueued) {
			return;
		}
		this.#rebuildQueued = true;
		queueMicrotask(() => {
			this.#rebuildQueued = false;
			this.#rebuild();
		});
	}

	#rebuild(): void {
		const host = this.element.parentElement;
		const scrollTop = host?.scrollTop ?? 0;
		const doc = this.#model.document.get();
		const source = this.#model.getText();
		const active = this.#model.activeBlocks.get();
		const children: MountChild[] = doc.blocks.map(block => ({
			kind: 'block',
			isActive: active.has(block),
			view: { ast: { id: block.id, length: block.length } },
		}));
		const box: ViewportBox = {
			scrollTop,
			height: host?.clientHeight || DEFAULT_VIEWPORT_HEIGHT_PX,
		};
		setViewportBox(box);
		const plan = planDocumentMount(children, box, new Map(
			this.measuredLayout.measurements.get().map(measurement => [measurement.block.id, measurement.height]),
		));

		const renderOptions: RenderOptions = {
			onOpenLink: href => this.#options.onOpenLink?.(href),
			onToggleCheckbox: (offset, checked) => {
				if (this.#options.onToggleCheckbox) {
					this.#options.onToggleCheckbox(offset, checked);
					return;
				}
				this.#model.setTaskCheckboxChecked(offset, checked, offset);
			},
			renderCustomCodeBlock: this.#options.renderCustomCodeBlock,
			highlightCode: (language, content, host) => this.#paintHighlight(language, content, host),
		};

		for (const session of this.#highlights.values()) {
			session.dispose();
		}
		this.#highlights.clear();
		this.#content.replaceChildren();
		const measurements: BlockMeasurement[] = [];
		const previousHeights = new Map(
			this.measuredLayout.measurements.get().map(measurement => [measurement.block.id, measurement.height]),
		);
		const mountRange = (start: number, end: number): void => {
			for (let i = start; i < end; i++) {
				const block = doc.blocks[i];
				if (!block) {
					continue;
				}
				const isActive = active.has(block) && !this.#keepIdle(block);
				const node = this.#renderBlock(block, source, isActive, renderOptions);
				const minHeight = activeBlockMinHeightPx(isActive, previousHeights.get(block.id));
				if (minHeight !== undefined) {
					node.element.style.minHeight = `${minHeight}px`;
				}
				this.#content.append(node.element);
				measurements.push({
					block,
					viewNode: node,
					absoluteStart: block.start,
					height: node.element.offsetHeight || 0,
					isMeasured: true,
				});
			}
		};

		if (!plan.virtualized || children.length < VIRTUALIZE_AFTER_CHILDREN) {
			mountRange(0, doc.blocks.length);
		} else {
			for (const segment of plan.segments) {
				if (segment.type === 'spacer') {
					const spacer = document.createElement('div');
					spacer.className = 'ib-md-virtual-spacer';
					spacer.style.height = `${segment.height}px`;
					spacer.setAttribute('aria-hidden', 'true');
					this.#content.append(spacer);
					continue;
				}
				mountRange(segment.start, segment.end);
			}
		}

		if (doc.blocks.length === 0) {
			const empty = document.createElement('div');
			empty.className = 'md-block md-paragraph md-block-active';
			empty.append(renderActiveSource('', 0));
			this.#content.append(empty);
		}

		this.measuredLayout.measurements.set(measurements, undefined);
		const rootView = new ViewNode(this.#content, source.length);
		viewNodes.set(this.#content, rootView);
		this.documentViewNode.set(rootView, undefined);
		this.#syncDomSelection();
		if (host) {
			host.scrollTop = scrollTop;
		}
	}

	#keepIdle(block: MdBlock): boolean {
		return block.kind === 'table' || (this.#options.idleBlockKinds?.includes(block.kind) ?? false);
	}

	#renderBlock(block: MdBlock, source: string, active: boolean, options: RenderOptions): BlockViewNode {
		const host = document.createElement('div');
		host.className = `md-block md-${block.kind}`;
		if (block instanceof CodeBlockAstNode) {
			host.classList.add('md-code-block');
			if (block.language) {
				host.dataset.ibLanguage = block.language;
			}
		}
		if (block.kind === 'unhandledBlock') {
			host.classList.add('md-unhandled-block');
		}
		if (block.kind === 'frontMatter') {
			host.classList.add('md-front-matter');
		}
		host.classList.toggle('md-block-active', active);
		host.classList.toggle('md-markers-hidden', !active);
		host.dataset.blockId = String(block.id);
		if (block instanceof HeadingAstNode) {
			host.classList.add(`md-h${block.depth}`);
		}
		if (active && !this.#model.readonlyMode.get()) {
			const inline = block.kind === 'paragraph' || block.kind === 'list' || block.kind === 'blockquote' || block.kind === 'heading';
			const slice = source.slice(block.start, block.end);
			if (block instanceof HeadingAstNode) {
				host.append(renderActiveSource(headingSourceForEdit(slice), block.start, inline, block.depth));
			} else {
				host.append(renderActiveSource(slice, block.start, inline));
			}
		} else {
			host.append(renderIdleBlock(block, source, options));
		}
		return new BlockViewNode(host, block);
	}

	#paintHighlight(language: string, content: string, host: HTMLElement): void {
		const highlighter = this.#options.syntaxHighlighter;
		if (!highlighter || !language) {
			return;
		}
		const session = highlighter.create(language, content);
		const paint = (): void => {
			const tokens = session.snapshot.get().tokens;
			if (tokens.length === 0) {
				host.textContent = content;
				return;
			}
			host.replaceChildren();
			let offset = 0;
			for (const token of tokens) {
				const slice = content.slice(offset, offset + token.length);
				offset += token.length;
				if (!token.className) {
					host.append(slice);
					continue;
				}
				const span = document.createElement('span');
				span.className = token.className.split('.').map(part => `tok-${part}`).join(' ');
				span.textContent = slice;
				host.append(span);
			}
		};
		session.snapshot.recomputeInitiallyAndOnChange(this._store, paint);
		this.#highlights.set(this.#highlights.size, session);
	}

	#syncDomSelection(): void {
		const selection = this.#model.selection.get();
		if (!selection || document.activeElement !== this.element) {
			return;
		}
		const start = this.#domPointFromOffset(selection.start);
		if (!start) {
			return;
		}
		const host = this.element.parentElement;
		const scrollTop = host?.scrollTop ?? 0;
		const range = document.createRange();
		range.setStart(start.node, start.offset);
		if (selection.isCollapsed) {
			range.collapse(true);
		} else {
			const end = this.#domPointFromOffset(selection.endExclusive) ?? start;
			range.setEnd(end.node, end.offset);
		}
		const domSel = window.getSelection();
		domSel?.removeAllRanges();
		domSel?.addRange(range);
		if (host) {
			host.scrollTop = scrollTop;
		}
	}

	#domPointFromOffset(offset: number): { node: Node; offset: number } | undefined {
		const nodes = this.#content.querySelectorAll('[data-source-offset]');
		let best: HTMLElement | undefined;
		let bestStart = -1;
		for (const node of nodes) {
			if (!(node instanceof HTMLElement)) {
				continue;
			}
			const start = Number(node.dataset.sourceOffset);
			if (!Number.isFinite(start) || start > offset) {
				continue;
			}
			if (start >= bestStart) {
				best = node;
				bestStart = start;
			}
		}
		if (!best) {
			return undefined;
		}
		const text = best.firstChild ?? best;
		const length = text.textContent?.length ?? 0;
		return { node: text, offset: Math.min(length, Math.max(0, offset - bestStart)) };
	}
}
