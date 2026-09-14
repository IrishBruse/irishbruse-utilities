import { Disposable } from './disposable';
import { observeAll } from './react';
import 'katex/dist/katex.min.css';
import './editorBase.css';
import './markdownEditor.css';
import { WebviewSyntaxHighlighter } from './syntaxHighlighter';
import { TableGridController } from './tableGridEditor';
import { HtmlPreviewController } from './htmlPreview';
import { UnhandledBlockChromeController } from './unhandledBlockChrome';
import { InactiveBlockClickController } from './inactiveBlockClick';
import { EolWhitespaceController } from './eolWhitespace';
import { SkillFrontMatterController } from './skillFrontMatter';
import { markdownEditorKeyboardProfile } from './keyboardProfile';
import {
	bindViewportVirtualization,
	recordMeasuredHeights,
	setViewportBox,
} from './viewportVirtualization';
import {
	applyWorkbenchMermaidTokens,
	getWorkbenchMermaidInit,
} from '../../mermaidEditor/vsCodeTheme.browser';
import {
	CodeBlockAstNode,
	EditorModel,
	Selection,
	StringValue,
	computeTextEdit,
	findNodeOffsetById,
} from '../core/index';
import { AsyncClipboardStrategy, EditorController } from './editorController';
import { EditorView } from './editorView';

interface VsCodeApi {
	postMessage(message: unknown): void;
	getState(): unknown;
	setState(state: unknown): void;
}

declare function acquireVsCodeApi(): VsCodeApi;

interface PersistedViewState {
	scrollTop?: number;
	selection?: { anchor: number; active: number };
}

interface InitialState {
	readonly content: string;
	readonly documentVersion: number;
	readonly readonly: boolean;
	readonly tables: {
		readonly maxColumnWidth: number;
		readonly style: 'wrapped' | 'compact';
	};
	readonly skillFrontMatter: boolean;
	readonly skillFolderName: string;
}

class Editor extends Disposable {
	readonly model = new EditorModel();
	isUpdatingFromExtension = false;
	#mermaidCounter = 0;
	readonly #messageSecret: string;
	readonly #vscode = acquireVsCodeApi();
	readonly #syntaxHighlighter = new WebviewSyntaxHighlighter((message) => this.#postToHost(message));

	constructor(host: HTMLElement, initialState: InitialState) {
		super();

		const messageSecret = document.querySelector<HTMLMetaElement>('meta[name="vscode-markdown-editor-message-secret"]')?.content;
		if (!messageSecret) {
			throw new Error('Missing Markdown editor message secret');
		}
		this.#messageSecret = messageSecret;

		this.model.sourceText.set(new StringValue(initialState.content), undefined);
		this.model.readonlyMode.set(initialState.readonly, undefined);

		window.addEventListener('message', (event) => {
			const message = event.data;
			if (!message || typeof message !== 'object' || message.messageSecret !== this.#messageSecret) {
				return;
			}
			if (this.#syntaxHighlighter.handleMessage(message)) {
				return;
			}
			if (message.type === 'update') {
				this.isUpdatingFromExtension = true;
				this.model.replaceSourceText(new StringValue(message.content));
				this.isUpdatingFromExtension = false;
			}
		});

		this.#createView(host, initialState);
		this.#postToHost({ type: 'ready', documentVersion: initialState.documentVersion });
	}

	#postToHost(message: unknown): void {
		if (!message || typeof message !== 'object') {
			return;
		}
		this.#vscode.postMessage({ ...message, messageSecret: this.#messageSecret });
	}

	#createView(host: HTMLElement, initialState: InitialState): void {
		const model = this.model;
		const content = initialState.content;
		const savedViewState = this.#getViewState();
		setViewportBox({
			scrollTop: typeof savedViewState.scrollTop === 'number' ? savedViewState.scrollTop : 0,
			height: host.clientHeight || 800,
		});

		const view = this._register(new EditorView(model, {
			classNames: ['md-theme-vscode-default'],
			idleBlockKinds: initialState.skillFrontMatter ? ['frontMatter'] : [],
			syntaxHighlighter: this.#syntaxHighlighter,
			onOpenLink: url => {
				this.#postToHost({ type: 'openLink', href: url });
			},
			onToggleCheckbox: (item, newChecked) => {
				const offset = typeof item === 'number' ? item : undefined;
				model.setTaskCheckboxChecked(item, newChecked, offset);
			},
			renderCustomCodeBlock: (language, content) => {
				if (language !== 'mermaid') {
					return undefined;
				}
				const div = document.createElement('div');
				div.className = 'md-mermaid';
				const diagram = document.createElement('div');
				diagram.className = 'md-mermaid-diagram';
				diagram.textContent = content;
				diagram.setAttribute('aria-busy', 'true');
				div.appendChild(diagram);
				const id = `mermaid-${this.#mermaidCounter++}`;
				loadMermaid()
					.then(mermaid => {
						configureMermaid(mermaid);
						return mermaid.render(id, content);
					})
					.then(({ svg }) => {
						diagram.innerHTML = svg;
						applyWorkbenchMermaidTokens(diagram);
						diagram.setAttribute('aria-busy', 'false');
					})
					.catch(error => {
						diagram.textContent = content;
						diagram.setAttribute('aria-busy', 'false');
						this.#postToHost({
							type: 'codeBlockEditorDiagnostic',
							message: `Failed to render Mermaid diagram: ${error instanceof Error ? error.message : String(error)}`,
						});
					});
				return div;
			},
		}));
		this._register(new TableGridController(model, view, host, initialState.tables));
		this._register(new HtmlPreviewController(model, view, url => {
			this.#postToHost({ type: 'openLink', href: url });
		}));
		if (initialState.skillFrontMatter) {
			this._register(new SkillFrontMatterController(model, view, host, initialState.skillFolderName));
		}
		this._register(new UnhandledBlockChromeController(view));
		this._register(new InactiveBlockClickController(model, view, host));
		this._register(new EolWhitespaceController(model, view));
		observeAll(this._store, () => {
			model.document.get();
			const measurements = view.measuredLayout.measurements.get();
			recordMeasuredHeights(measurements);
			for (const measurement of measurements) {
				const block = measurement.block;
				if (!(block instanceof CodeBlockAstNode)) {
					continue;
				}
				const el = measurement.viewNode?.dom;
				if (!(el instanceof HTMLElement)) {
					continue;
				}
				const language = block.language.trim();
				if (language) {
					el.dataset.ibLanguage = language;
				} else {
					delete el.dataset.ibLanguage;
				}
				syncMermaidOpenPreviewButton(el, language, () => {
					const doc = model.document.get();
					const offset = findNodeOffsetById(doc, block);
					if (offset === undefined) {
						return;
					}
					this.#postToHost({ type: 'openMermaidPreview', offset });
				});
			}
		}, model.document, view.measuredLayout.measurements);

		this._register(new EditorController(model, view, {
			clipboardStrategy: new AsyncClipboardStrategy(),
			keyboardProfile: markdownEditorKeyboardProfile,
			historyStrategy: {
				undo: () => this.#postToHost({ type: 'history', command: 'undo' }),
				redo: () => this.#postToHost({ type: 'history', command: 'redo' }),
			},
		}));
		host.appendChild(view.element);
		this._register({ dispose: bindViewportVirtualization(view, host) });

		if (savedViewState.selection) {
			const max = content.length;
			const anchor = Math.min(savedViewState.selection.anchor, max);
			const active = Math.min(savedViewState.selection.active, max);
			model.selection.set(new Selection(anchor, active), undefined);
		}

		let scrollSaveScheduled = false;
		const saveScroll = (): void => {
			scrollSaveScheduled = false;
			this.#patchViewState({ scrollTop: host.scrollTop });
		};
		const onScroll = (): void => {
			if (scrollSaveScheduled) { return; }
			scrollSaveScheduled = true;
			requestAnimationFrame(saveScroll);
		};
		host.addEventListener('scroll', onScroll, { passive: true });
		this._register({ dispose: () => host.removeEventListener('scroll', onScroll) });

		const onHide = (): void => {
			if (document.visibilityState === 'hidden') {
				this.#patchViewState({ scrollTop: host.scrollTop });
			}
		};
		document.addEventListener('visibilitychange', onHide);
		window.addEventListener('pagehide', saveScroll);
		this._register({ dispose: () => { document.removeEventListener('visibilitychange', onHide); window.removeEventListener('pagehide', saveScroll); } });

		this.model.selection.recomputeInitiallyAndOnChange(this._store, () => {
			const sel = this.model.selection.get();
			this.#patchViewState({ selection: sel ? { anchor: sel.anchor, active: sel.active } : undefined });
		});

		let firstReadonly = true;
		this.model.readonlyMode.recomputeInitiallyAndOnChange(this._store, () => {
			const isReadonly = this.model.readonlyMode.get();
			if (!firstReadonly) {
				this.#postToHost({ type: 'setReadonly', readonly: isReadonly });
			}
			firstReadonly = false;
		});

		let previousText = this.model.sourceText.get().value;
		this.model.sourceText.recomputeInitiallyAndOnChange(this._store, () => {
			const text = this.model.sourceText.get().value;
			if (!this.isUpdatingFromExtension && text !== previousText) {
				this.#postToHost({ type: 'edit', ...computeTextEdit(previousText, text) });
			}
			previousText = text;
		});

		this.#restoreScroll(host, savedViewState.scrollTop);
	}

	#getViewState(): PersistedViewState {
		return (this.#vscode.getState() as PersistedViewState | undefined) ?? {};
	}

	#patchViewState(patch: PersistedViewState): void {
		this.#vscode.setState({ ...this.#getViewState(), ...patch });
	}

	#restoreScroll(host: HTMLElement, scrollTop: number | undefined): void {
		if (typeof scrollTop !== 'number' || scrollTop <= 0) {
			return;
		}
		let tries = 0;
		const apply = (): void => {
			host.scrollTop = scrollTop;
			if (++tries < 6 && Math.abs(host.scrollTop - scrollTop) > 1) {
				requestAnimationFrame(apply);
			}
		};
		requestAnimationFrame(apply);
	}
}

let mermaidPromise: Promise<(typeof import('mermaid'))['default']> | undefined;

function loadMermaid(): Promise<(typeof import('mermaid'))['default']> {
	if (!mermaidPromise) {
		mermaidPromise = import('mermaid').then(module => module.default);
	}
	return mermaidPromise;
}

function configureMermaid(mermaid: (typeof import('mermaid'))['default']): void {
	const theme = getWorkbenchMermaidInit();
	mermaid.initialize({
		startOnLoad: false,
		theme: 'base',
		themeVariables: theme.themeVariables,
		themeCSS: theme.themeCSS,
	});
}

function syncMermaidOpenPreviewButton(
	el: HTMLElement,
	language: string,
	onOpenPreview: () => void,
): void {
	const existing = el.querySelector(':scope > .ib-mermaid-open-preview');
	if (language.toLowerCase() !== 'mermaid') {
		delete el.dataset.ibMermaidPreview;
		existing?.remove();
		return;
	}

	el.dataset.ibMermaidPreview = '';
	let button = existing instanceof HTMLButtonElement ? existing : undefined;
	if (!button) {
		button = document.createElement('button');
		button.type = 'button';
		button.className = 'ib-mermaid-open-preview';
		button.textContent = 'Open Preview';
		button.title = 'Open Mermaid preview';
		el.prepend(button);
		button.addEventListener('pointerdown', (event) => {
			event.preventDefault();
			event.stopPropagation();
			mermaidOpenPreviewByButton.get(button!)?.();
		});
	}
	mermaidOpenPreviewByButton.set(button, onOpenPreview);
}

const mermaidOpenPreviewByButton = new WeakMap<HTMLButtonElement, () => void>();

function readInitialState(): InitialState {
	const element = document.getElementById('vscode-markdown-editor-initial-state');
	if (!(element instanceof HTMLMetaElement)) {
		throw new Error('Markdown editor initial state was not found.');
	}
	element.remove();
	const value: unknown = JSON.parse(decodeURIComponent(element.content));
	if (!isInitialState(value)) {
		throw new Error('Markdown editor initial state is invalid.');
	}
	return value;
}

function isInitialState(value: unknown): value is InitialState {
	if (!value || typeof value !== 'object') {
		return false;
	}
	const candidate = value as Record<string, unknown>;
	return typeof candidate.content === 'string'
		&& typeof candidate.documentVersion === 'number'
		&& typeof candidate.readonly === 'boolean'
		&& isTableSettings(candidate.tables)
		&& typeof candidate.skillFrontMatter === 'boolean'
		&& typeof candidate.skillFolderName === 'string';
}

function isTableSettings(value: unknown): value is InitialState['tables'] {
	if (!value || typeof value !== 'object') {
		return false;
	}
	const candidate = value as Record<string, unknown>;
	return typeof candidate.maxColumnWidth === 'number'
		&& (candidate.style === 'wrapped' || candidate.style === 'compact');
}

new Editor(document.getElementById('editor')!, readInitialState());
