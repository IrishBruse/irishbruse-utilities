/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { AsyncClipboardStrategy, EditorController, EditorModel, EditorView, GutterMarker, OffsetRange, Selection, StringValue, commands, findNodeOffsetById, CodeBlockAstNode, vscodeKeyboardProfile } from '@vscode/markdown-editor';
import { Disposable } from './disposable';
import { observeAll } from './observeAll';
import 'katex/dist/katex.min.css';
import '@vscode/markdown-editor/editor.css';
import '@vscode/markdown-editor/themes/vscode-default.css';
import './markdownEditor.css';
import { WebviewSyntaxHighlighter } from './syntaxHighlighter';
import { UnhandledBlockChromeController } from './unhandledBlockChrome';
import { InactiveBlockClickController } from './inactiveBlockClick';
import { HtmlPreviewController } from './htmlPreview';
import {
	applyWorkbenchMermaidTokens,
	getWorkbenchMermaidInit,
} from '../../mermaidEditor/vsCodeTheme.browser';

interface VsCodeApi {
	postMessage(message: unknown): void;
	getState(): unknown;
	setState(state: unknown): void;
}

declare function acquireVsCodeApi(): VsCodeApi;

/**
 * The editor's view state, persisted as webview state (`getState`/`setState`) so
 * the scroll and cursor position are restored when the webview is reloaded or the
 * custom editor is re-created (e.g. after switching sessions and back).
 */
interface PersistedViewState {
	scrollTop?: number;
	selection?: { anchor: number; active: number };
}

interface InitialState {
	readonly content: string;
	readonly documentVersion: number;
	readonly readonly: boolean;
}

class Editor extends Disposable {
	readonly model = new EditorModel();
	isUpdatingFromExtension = false;
	#mermaidCounter = 0;
	#controller: EditorController | undefined;
	#view: EditorView | undefined;
	// the message secret allows to distinguish vscode sending us a message vs a nested iframe
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
			switch (message.type) {
				case 'update': {
					// `replaceSourceText` (not `sourceText.set`) applies authoritative host
					// text: it maps the selection through the change and clears stale
					// pending-paragraph state, so the caret stays valid after an undo shrinks
					// the document. The guard stops this echoing back as a user edit.
					this.isUpdatingFromExtension = true;
					this.model.replaceSourceText(new StringValue(message.content));
					this.isUpdatingFromExtension = false;
					break;
				}
				case 'gutterMarkers': {
					const markers: GutterMarker[] = message.markers.map((marker: { start: number; endExclusive: number; type: GutterMarker['type'] }) => ({
						range: OffsetRange.fromTo(marker.start, marker.endExclusive),
						type: marker.type,
					}));
					this.model.gutterMarkers.set(markers, undefined);
					break;
				}
				case 'command': {
					const command = commands.find(command => command.id === message.command);
					if (command) {
						this.#controller?.executeCommand(command);
					}
					break;
				}
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

		const view = this._register(new EditorView(model, {
			classNames: ['md-theme-vscode-default'],
			syntaxHighlighter: this.#syntaxHighlighter,
			onOpenLink: url => {
				this.#postToHost({ type: 'openLink', href: url });
			},
			onToggleCheckbox: (item, newChecked) => {
				model.setTaskCheckboxChecked(item, newChecked);
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
						const message = error instanceof Error ? error.message : String(error);
						diagram.classList.add('ib-mermaid-error');
						diagram.textContent = `Mermaid render failed: ${message}\n\n${content}`;
						diagram.setAttribute('aria-busy', 'false');
						console.error('Failed to render Mermaid diagram:', message);
					});
				return div;
			},
		}));
		this.#view = view;
		this._register(new UnhandledBlockChromeController(view));
		this._register(new InactiveBlockClickController(model, view, host));
		this._register(new HtmlPreviewController(model, view, url => this.#postToHost({ type: 'openLink', href: url })));

		observeAll(this._store, () => {
			model.document.get();
			forEachMeasuredCodeBlock(view, (el, block) => {
				syncCodeBlockLanguageBadge(el, block.language.trim());
				syncMermaidOpenPreviewButton(el, block.language.trim(), () => {
					const doc = model.document.get();
					const offset = findNodeOffsetById(doc, block);
					if (offset === undefined) {
						return;
					}
					this.#postToHost({ type: 'openMermaidPreview', offset });
				});
			});
		}, model.document, view.measuredLayout.measurements);

		// Handle all keyboard actions in the webview. VS Code splits local vs host
		// routing (`vscodeLocalKeyboardProfile` + `forwardedKeyboardProfile`) and
		// registers `markdown.editor.*` commands; this extension does not, so
		// host-routed keys (Backspace, arrows, Enter, …) must stay local.
		this.#controller = this._register(new EditorController(model, view, {
			clipboardStrategy: new AsyncClipboardStrategy(),
			keyboardProfile: vscodeKeyboardProfile,
			find: false,
			historyStrategy: {
				undo: () => this.#postToHost({ type: 'history', command: 'undo' }),
				redo: () => this.#postToHost({ type: 'history', command: 'redo' }),
			},
		}));
		let lastEditorFocus: boolean | undefined;
		const postEditorFocus = (): void => {
			const focused = document.hasFocus() && document.activeElement === view.element;
			if (focused === lastEditorFocus) {
				return;
			}
			lastEditorFocus = focused;
			this.#postToHost({ type: 'editorFocusChanged', focused });
		};
		const onFocusOut = (): void => queueMicrotask(postEditorFocus);
		document.addEventListener('focusin', postEditorFocus);
		document.addEventListener('focusout', onFocusOut);
		window.addEventListener('focus', postEditorFocus);
		window.addEventListener('blur', postEditorFocus);
		this._register({
			dispose: () => {
				document.removeEventListener('focusin', postEditorFocus);
				document.removeEventListener('focusout', onFocusOut);
				window.removeEventListener('focus', postEditorFocus);
				window.removeEventListener('blur', postEditorFocus);
			},
		});
		host.appendChild(view.element);
		postEditorFocus();

		if (savedViewState.selection) {
			const max = content.length;
			const anchor = Math.min(savedViewState.selection.anchor, max);
			const active = Math.min(savedViewState.selection.active, max);
			model.selection.set(new Selection(anchor, active), undefined);
		}

		// Persist scroll as webview state (throttled to a frame). Registered after the
		// restore above so it never clobbers the values we are about to restore.
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

		// Flush the latest scroll synchronously before the webview is hidden or torn
		// down, since the frame-throttled save above may not have run yet.
		const onHide = (): void => {
			if (document.visibilityState === 'hidden') {
				this.#patchViewState({ scrollTop: host.scrollTop });
			}
		};
		document.addEventListener('visibilitychange', onHide);
		window.addEventListener('pagehide', saveScroll);
		this._register({ dispose: () => { document.removeEventListener('visibilitychange', onHide); window.removeEventListener('pagehide', saveScroll); } });

		// Persist the cursor whenever it moves.
		this.model.selection.recomputeInitiallyAndOnChange(this._store, () => {
			const sel = this.model.selection.get();
			this.#patchViewState({ selection: sel ? { anchor: sel.anchor, active: sel.active } : undefined });
		});

		// Persist the edit/read-only mode as the global default whenever the lock
		// toggle flips it, so the next Markdown editor opens in the same mode. The
		// initial (restored) value is skipped so opening an editor doesn't re-write it.
		let firstReadonly = true;
		this.model.readonlyMode.recomputeInitiallyAndOnChange(this._store, () => {
			const isReadonly = this.model.readonlyMode.get();
			if (!firstReadonly) {
				this.#postToHost({ type: 'setReadonly', readonly: isReadonly });
			}
			firstReadonly = false;
		});

		// Forward user edits to the extension. Edits are ignored by the model while
		// read-only, so this is a no-op in that mode; keeping it always registered
		// means unlocking a read-only editor immediately resumes edit forwarding.
		let previousText = this.model.sourceText.get().value;
		this.model.sourceText.recomputeInitiallyAndOnChange(this._store, () => {
			const text = this.model.sourceText.get().value;
			if (!this.isUpdatingFromExtension && text !== previousText) {
				this.#postToHost({ type: 'edit', ...computeTextEdit(previousText, text) });
			}
			previousText = text;
		});

		// Restore scroll last: content height settles over a few frames (async parse,
		// syntax highlighting, mermaid), so re-apply until it sticks.
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

function forEachMeasuredCodeBlock(
	view: EditorView,
	callback: (el: HTMLElement, block: CodeBlockAstNode) => void,
): void {
	for (const measurement of view.measuredLayout.measurements.get()) {
		const block = measurement.block;
		if (!(block instanceof CodeBlockAstNode)) {
			continue;
		}
		const el = measurement.viewNode?.dom;
		if (!(el instanceof HTMLElement)) {
			continue;
		}
		callback(el, block);
	}
}

function syncCodeBlockLanguageBadge(el: HTMLElement, language: string): void {
	if (language) {
		el.dataset.ibLanguage = language;
	} else {
		delete el.dataset.ibLanguage;
	}
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
		&& typeof candidate.readonly === 'boolean';
}

function computeTextEdit(previousText: string, text: string): { start: number; endExclusive: number; text: string } {
	let start = 0;
	while (start < previousText.length && start < text.length && previousText.charCodeAt(start) === text.charCodeAt(start)) {
		start++;
	}

	let previousEnd = previousText.length;
	let end = text.length;
	while (previousEnd > start && end > start && previousText.charCodeAt(previousEnd - 1) === text.charCodeAt(end - 1)) {
		previousEnd--;
		end--;
	}

	return {
		start,
		endExclusive: previousEnd,
		text: text.slice(start, end),
	};
}

new Editor(document.getElementById('editor')!, readInitialState());
