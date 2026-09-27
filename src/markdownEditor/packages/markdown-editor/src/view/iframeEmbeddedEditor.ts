/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * EXPERIMENTAL — the iframe-backed implementation of the {@link IEmbeddedCodeEditor}
 * seam (see `blockView.ts`). It embeds a third-party web editor (the *guest*,
 * e.g. `@vscode/sample-web-editor`) in an `<iframe>` and bridges it to the code
 * block using the `@vscode/web-editors` host↔guest protocol:
 *
 *   - document → editor : {@link IEmbeddedCodeEditor.setContent} → `host.setText`
 *   - editor → document : guest edit → `host.onDidChangeText` → {@link IEmbeddedCodeEditor.onEdit}
 *     as a whole-content {@link StringEdit}
 *   - sizing            : guest `reportSize` → `host.onDidReportSize` → logical and physical height
 *
 * Providers supply HTML and may provide a base URL for scripts and assets.
 * The host injects theme and sizing support, then loads it into pooled,
 * absolutely positioned frames. Logical placeholders remain in document flow.
 * Frames use `sandbox="allow-scripts"` (no `allow-same-origin`) → opaque
 * origin, matching the `WindowMessageTransport` posture.
 *
 * The implementation is exported by the markdown editor, while its web-editor
 * runtime is bundled into the package so consumers do not need a runtime
 * dependency on `@vscode/web-editors`.
 */

import { HubRpcConnection, JsonRpcChannel } from '@vscode/hubrpc';
import { WebEditorHost, WindowMessageTransport, type ContentType, type HostTransport } from '@vscode/web-editors';
import type { IDisposable } from '@vscode/observables';
import { OffsetRange } from '../core/offsetRange.js';
import { StringEdit } from '../core/stringEdit.js';
import type { IEmbeddedCodeEditor, IEmbeddedCodeEditorFactory } from './content/blockView.js';

export type CodeBlockEditorSelector =
	| { readonly language: string }
	| { readonly languagePrefix: string };

export type IframeEmbeddedEditorProviderSelector = CodeBlockEditorSelector;

export interface CodeBlockEditorProviderDefinition {
	readonly id: string;
	readonly selector: CodeBlockEditorSelector;
}

export interface IframeEmbeddedEditorProvider extends CodeBlockEditorProviderDefinition {
	readonly resolve: (infoString: string) => Promise<ResolvedIframeEmbeddedEditor | undefined>;
	readonly createHostTransport?: (runtimeKey: string) => IframeEmbeddedEditorHostTransport;
}

export type IframeEmbeddedEditorHostTransport = HostTransport & IDisposable;

export type CodeBlockEditorProviderSelection<T> =
	| { readonly kind: 'match'; readonly provider: T }
	| { readonly kind: 'ambiguous'; readonly providers: readonly T[] };

export function selectCodeBlockEditorProvider<T extends CodeBlockEditorProviderDefinition>(
	providers: readonly T[],
	language: string,
): CodeBlockEditorProviderSelection<T> | undefined {
	const exact = providers.filter(provider => 'language' in provider.selector && provider.selector.language === language);
	if (exact.length > 0) {
		return exact.length === 1
			? { kind: 'match', provider: exact[0] }
			: { kind: 'ambiguous', providers: exact };
	}

	let bestLength = -1;
	let best: T[] = [];
	for (const provider of providers) {
		if (!('languagePrefix' in provider.selector) || !language.startsWith(provider.selector.languagePrefix)) {
			continue;
		}
		const length = provider.selector.languagePrefix.length;
		if (length > bestLength) {
			bestLength = length;
			best = [provider];
		} else if (length === bestLength) {
			best.push(provider);
		}
	}
	if (best.length === 0) {
		return undefined;
	}
	return best.length === 1
		? { kind: 'match', provider: best[0] }
		: { kind: 'ambiguous', providers: best };
}

export interface IframeSandboxOptions {
	readonly forms?: boolean;
	readonly downloads?: boolean;
	readonly pointerLock?: boolean;
	readonly clipboardWrite?: boolean;
}

export type ResolvedIframeEmbeddedEditorSandbox = IframeSandboxOptions;

export interface ResolvedIframeEmbeddedEditor {
	readonly html: string;
	readonly runtimeKey: string;
	readonly resourceBaseUrl?: string;
	readonly hostTransport?: boolean;
	readonly contentType?: ContentType;
	readonly initialHeight?: number;
	readonly sandbox?: IframeSandboxOptions;
}

export interface VirtualizedIframeEmbeddedEditorOptions {
	readonly providers: readonly IframeEmbeddedEditorProvider[];
	readonly root?: Element | Document | null;
	readonly frameRoot?: HTMLElement;
	readonly scriptNonce?: string;
	readonly themeCss?: string | (() => string);
	/** Optional same-origin document URL to load before writing the iframe content. */
	readonly iframeBootstrapUrl?: string;
	readonly defaultHeight?: number;
	readonly onAmbiguous?: (language: string, providers: readonly CodeBlockEditorProviderDefinition[]) => void;
	readonly onDidChange?: () => void;
}

export interface VirtualizedIframeEmbeddedEditorDiagnostics {
	readonly logicalEditors: number;
	readonly leasedFrames: number;
	readonly idleFrames: number;
	readonly descriptorCacheEntries: number;
	readonly descriptorCacheHits: number;
}

const BASE_CSS = `
	:root { color-scheme: light dark; }
	html, body { margin: 0; padding: 0; background: transparent; }
	body {
		font-family: var(--vscode-font-family, system-ui, sans-serif);
		font-size: var(--vscode-font-size, 13px);
		color: var(--vscode-foreground, #1e1e1e);
		box-sizing: border-box;
	}
`;

const CONTROL_MESSAGE = 'vscode-markdown-editor::control';
const MAX_IFRAME_HEIGHT = 10_000;

export function buildIframeEmbeddedEditorSrcdoc(authorHtml: string, resourceBaseUrl: string | undefined, themeCss: string | undefined, scriptNonce: string | undefined): string {
	const safeBaseCss = BASE_CSS.replace(/<\/style/gi, '<\\/style');
	const safeThemeCss = (themeCss ?? '').replace(/<\/style/gi, '<\\/style');
	const nonceAttribute = scriptNonce ? ` nonce="${escapeHtmlAttribute(scriptNonce)}"` : '';
	const baseElement = resourceBaseUrl ? `<base href="${escapeHtmlAttribute(resourceBaseUrl)}">` : '';
	const injection = baseElement +
		`<style data-vscode-markdown-editor-base>${safeBaseCss}</style>` +
		`<style data-vscode-markdown-editor-theme>${safeThemeCss}</style>` +
		`<script${nonceAttribute}>(function(){` +
		`var t=document.currentScript.previousElementSibling;` +
		`var sendSize=function(){parent.postMessage({type:${JSON.stringify(CONTROL_MESSAGE)},height:Math.max(document.documentElement.scrollHeight,document.body?document.body.scrollHeight:0)},"*");};` +
		`addEventListener("message",function(e){if(e.source!==parent)return;var d=e.data;if(d&&d.type===${JSON.stringify(CONTROL_MESSAGE)}&&typeof d.themeCss==="string")t.textContent=d.themeCss;});` +
		`addEventListener("load",sendSize);new ResizeObserver(sendSize).observe(document.documentElement);` +
		`})();<\/script>`;

	const html = scriptNonce
		? authorHtml.replace(/<script\b(?![^>]*\bnonce\s*=)/gi, `<script${nonceAttribute}`)
		: authorHtml;
	const headMatch = html.match(/<head[^>]*>/i);
	if (headMatch?.index !== undefined) {
		const end = headMatch.index + headMatch[0].length;
		return html.slice(0, end) + injection + html.slice(end);
	}
	const htmlMatch = html.match(/<html[^>]*>/i);
	if (htmlMatch?.index !== undefined) {
		const end = htmlMatch.index + htmlMatch[0].length;
		return html.slice(0, end) + `<head>${injection}</head>` + html.slice(end);
	}
	return `<!doctype html><html><head>${injection}</head><body>${html}</body></html>`;
}

function escapeHtmlAttribute(value: string): string {
	return value.replaceAll('&', '&amp;').replaceAll('"', '&quot;');
}

export class VirtualizedIframeEmbeddedEditorFactory implements IEmbeddedCodeEditorFactory, IDisposable {
	private readonly _frameLayer: HTMLElement;
	private _frameRoot: HTMLElement | undefined;
	private _restoreFrameRootPosition: string | undefined;
	private _layoutObserver: ResizeObserver | undefined;
	private _layoutFrame = 0;
	private readonly _observer: IntersectionObserver | undefined;
	private readonly _logicalEditors = new Set<VirtualizedIframeEmbeddedEditor>();
	private readonly _pools = new Map<string, PhysicalIframePool>();
	private readonly _descriptorCache = new Map<string, Promise<ResolvedIframeEmbeddedEditor | undefined>>();
	private readonly _rejectedProviders = new Set<string>();
	private _providers: readonly IframeEmbeddedEditorProvider[];
	private _generation = 0;
	private _descriptorCacheHits = 0;
	private _disposed = false;

	constructor(private readonly _options: VirtualizedIframeEmbeddedEditorOptions) {
		this._providers = _options.providers;
		this._frameLayer = document.createElement('div');
		this._frameLayer.style.position = 'absolute';
		this._frameLayer.style.inset = '0';
		this._frameLayer.style.height = '0';
		this._frameLayer.style.pointerEvents = 'none';
		this._frameLayer.style.zIndex = '1';
		if (_options.frameRoot) {
			this._setFrameRoot(_options.frameRoot);
		}
		this._observer = typeof IntersectionObserver === 'undefined'
			? undefined
			: new IntersectionObserver(entries => {
				for (const entry of entries) {
					const editor = Array.from(this._logicalEditors).find(candidate => candidate.element === entry.target);
					editor?.setVisible(entry.isIntersecting);
				}
			}, { root: _options.root ?? null });
	}

	public updateProviders(providers: readonly IframeEmbeddedEditorProvider[]): void {
		this._providers = providers;
		this._generation++;
		this._descriptorCache.clear();
		this._rejectedProviders.clear();
		this._descriptorCacheHits = 0;
		this._disposePools();
		for (const editor of this._logicalEditors) {
			editor.invalidate();
		}
		this._options.onDidChange?.();
	}

	public get diagnostics(): VirtualizedIframeEmbeddedEditorDiagnostics {
		let leasedFrames = 0;
		let idleFrames = 0;
		for (const pool of this._pools.values()) {
			leasedFrames += pool.leasedFrames;
			idleFrames += pool.idleFrames;
		}
		return {
			logicalEditors: this._logicalEditors.size,
			leasedFrames,
			idleFrames,
			descriptorCacheEntries: this._descriptorCache.size,
			descriptorCacheHits: this._descriptorCacheHits,
		};
	}

	public create(language: string, infoString: string, initialContent: string): IEmbeddedCodeEditor | undefined {
		const selection = selectCodeBlockEditorProvider(this._providers, language);
		if (!selection) {
			return undefined;
		}
		if (selection.kind === 'ambiguous') {
			this._options.onAmbiguous?.(language, selection.providers);
			return undefined;
		}
		const requestKey = descriptorRequestKey(selection.provider.id, infoString);
		if (this._rejectedProviders.has(requestKey)) {
			return undefined;
		}
		const editor = new VirtualizedIframeEmbeddedEditor(
			this,
			selection.provider,
			infoString,
			initialContent,
			this._options.defaultHeight ?? 120,
			this._generation,
		);
		this._logicalEditors.add(editor);
		this._observer?.observe(editor.element);
		if (this._layoutObserver) {
			editor.observeLayout(this._layoutObserver);
		}
		if (!this._observer) {
			editor.setVisible(true);
		}
		return editor;
	}

	public dispose(): void {
		if (this._disposed) { return; }
		this._disposed = true;
		this._observer?.disconnect();
		this._layoutObserver?.disconnect();
		cancelAnimationFrame(this._layoutFrame);
		window.removeEventListener('resize', this._scheduleLayout);
		for (const editor of Array.from(this._logicalEditors)) {
			editor.dispose();
		}
		this._disposePools();
		this._frameLayer.remove();
		if (this._frameRoot && this._restoreFrameRootPosition !== undefined) {
			this._frameRoot.style.position = this._restoreFrameRootPosition;
		}
	}

	public remove(editor: VirtualizedIframeEmbeddedEditor): void {
		this._observer?.unobserve(editor.element);
		this._layoutObserver?.unobserve(editor.element);
		this._logicalEditors.delete(editor);
		editor.frame?.unbind();
	}

	public async resolve(editor: VirtualizedIframeEmbeddedEditor, generation: number): Promise<void> {
		const requestKey = descriptorRequestKey(editor.provider.id, editor.infoString);
		let descriptorPromise = this._descriptorCache.get(requestKey);
		let descriptor: ResolvedIframeEmbeddedEditor | undefined;
		try {
			if (!descriptorPromise) {
				descriptorPromise = editor.provider.resolve(editor.infoString);
				this._descriptorCache.set(requestKey, descriptorPromise);
			} else {
				this._descriptorCacheHits++;
			}
			descriptor = await descriptorPromise;
		} catch {
			if (descriptorPromise && this._descriptorCache.get(requestKey) === descriptorPromise) {
				this._descriptorCache.delete(requestKey);
			}
			this._rejectEditor(editor, generation, requestKey);
			return;
		}
		if (
			this._disposed
			|| editor.disposed
			|| generation !== this._generation
			|| !descriptor
		) {
			this._rejectEditor(editor, generation, requestKey);
			return;
		}
		const poolKey = getIframeEmbeddedEditorPoolKey(editor.provider.id, descriptor);
		let pool = this._pools.get(poolKey);
		if (!pool) {
			const frameRoot = this._ensureFrameRoot(editor);
			pool = new PhysicalIframePool(
				editor.provider,
				descriptor,
				this._frameLayer,
				frameRoot,
				this._options.scriptNonce,
				this._options.themeCss,
				this._options.iframeBootstrapUrl,
			);
			this._pools.set(poolKey, pool);
		}
		editor.resolve(pool);
	}

	private _rejectEditor(editor: VirtualizedIframeEmbeddedEditor, generation: number, requestKey: string): void {
		editor.resolve(undefined);
		if (!this._disposed && !editor.disposed && generation === this._generation) {
			this._rejectedProviders.add(requestKey);
			this._options.onDidChange?.();
		}
	}

	private _ensureFrameRoot(editor: VirtualizedIframeEmbeddedEditor): HTMLElement {
		return this._frameRoot ?? this._setFrameRoot(
			editor.element.closest<HTMLElement>('.md-editor')
				?? (this._options.root instanceof HTMLElement ? this._options.root : document.body),
		);
	}

	private _setFrameRoot(frameRoot: HTMLElement): HTMLElement {
		this._frameRoot = frameRoot;
		if (frameRoot !== document.body && getComputedStyle(frameRoot).position === 'static') {
			this._restoreFrameRootPosition = frameRoot.style.position;
			frameRoot.style.position = 'relative';
		}
		frameRoot.appendChild(this._frameLayer);
		if (typeof ResizeObserver !== 'undefined') {
			this._layoutObserver = new ResizeObserver(() => this._scheduleLayout());
			this._layoutObserver.observe(frameRoot);
			for (const editor of this._logicalEditors) {
				editor.observeLayout(this._layoutObserver);
			}
		}
		window.addEventListener('resize', this._scheduleLayout);
		return frameRoot;
	}

	private readonly _scheduleLayout = (): void => {
		if (this._layoutFrame) { return; }
		this._layoutFrame = requestAnimationFrame(() => {
			this._layoutFrame = 0;
			for (const pool of this._pools.values()) {
				pool.layout();
			}
		});
	};

	private _disposePools(): void {
		for (const pool of this._pools.values()) {
			pool.dispose();
		}
		this._pools.clear();
	}
}

class VirtualizedIframeEmbeddedEditor implements IEmbeddedCodeEditor {
	public readonly element: HTMLElement;
	public onEdit?: (edit: StringEdit) => void;
	public readonly estimateHeight: () => number;
	public frame: PhysicalIframe | undefined;
	public disposed = false;
	public visible = false;
	public readonly infoString: string;

	private readonly _frameHost: HTMLElement;
	private _content: string;
	private _readOnly = false;
	private _pool: PhysicalIframePool | undefined;
	private _resolved = false;

	constructor(
		private readonly _factory: VirtualizedIframeEmbeddedEditorFactory,
		public readonly provider: IframeEmbeddedEditorProvider,
		infoString: string,
		initialContent: string,
		initialHeight: number,
		generation: number,
	) {
		this.infoString = infoString;
		this._content = initialContent;
		this.element = document.createElement('div');
		this.element.style.width = '100%';
		this.element.style.minHeight = `${initialHeight}px`;
		this._frameHost = document.createElement('div');
		this._frameHost.style.width = '100%';
		this.element.appendChild(this._frameHost);
		this.estimateHeight = () => parseFloat(this.element.style.minHeight) || initialHeight;
		void this._factory.resolve(this, generation);
	}

	public setContent(content: string): void {
		if (content === this._content) { return; }
		this._content = content;
		this.frame?.bind(this);
	}

	public setReadOnly(readOnly: boolean): void {
		if (this._readOnly === readOnly) { return; }
		this._readOnly = readOnly;
		this.frame?.bind(this);
	}

	public setVisible(visible: boolean): void {
		this.visible = visible;
		if (!this._resolved) { return; }
		if (visible) {
			this._pool?.acquire(this);
		} else if (!this.hasFocus()) {
			this._pool?.release(this);
		}
	}

	public resolve(pool: PhysicalIframePool | undefined): void {
		if (this.disposed) { return; }
		this._resolved = true;
		this._pool = pool;
		if (!pool) {
			this._renderFallback();
		} else if (pool.descriptor.initialHeight !== undefined) {
			this.element.style.minHeight = `${pool.descriptor.initialHeight}px`;
		}
		if (this.visible) {
			pool?.acquire(this);
		}
	}

	public invalidate(): void {
		this.frame?.unbind();
		this._pool = undefined;
		this._resolved = false;
		this._renderFallback();
	}

	public bindFrame(frame: PhysicalIframe): void {
		this.frame = frame;
		frame.layout(this);
	}

	public unbindFrame(height: number): void {
		if (this.frame) {
			this.element.style.minHeight = `${height}px`;
			this.frame = undefined;
		}
	}

	public applyGuestText(text: string): void {
		if (text === this._content) { return; }
		const edit = StringEdit.replace(OffsetRange.ofLength(this._content.length), text);
		this._content = text;
		this.onEdit?.(edit);
	}

	public applyHeight(height: number): void {
		const value = clampIframeHeight(height);
		this.element.style.minHeight = `${value}px`;
		if (this.frame) {
			this.frame.iframe.style.height = `${value}px`;
			this.frame.layout(this);
		}
	}

	public observeLayout(observer: ResizeObserver): void {
		observer.observe(this.element);
	}

	public hasFocus(): boolean {
		return this.frame !== undefined && document.activeElement === this.frame.iframe;
	}

	public get content(): string { return this._content; }
	public get readOnly(): boolean { return this._readOnly; }
	public get frameHost(): HTMLElement { return this._frameHost; }

	public dispose(): void {
		if (this.disposed) { return; }
		this.disposed = true;
		this._factory.remove(this);
		this.element.remove();
	}

	private _renderFallback(): void {
		const pre = document.createElement('pre');
		const code = document.createElement('code');
		code.textContent = this._content;
		pre.appendChild(code);
		this._frameHost.replaceChildren(pre);
	}
}

class PhysicalIframePool implements IDisposable {
	public readonly descriptor: ResolvedIframeEmbeddedEditor;
	private readonly _frames = new Set<PhysicalIframe>();

	constructor(
		private readonly _provider: IframeEmbeddedEditorProvider,
		descriptor: ResolvedIframeEmbeddedEditor,
		private readonly _frameLayer: HTMLElement,
		private readonly _frameRoot: HTMLElement,
		private readonly _scriptNonce: string | undefined,
		private readonly _themeCss: string | (() => string) | undefined,
		private readonly _iframeBootstrapUrl: string | undefined,
	) {
		this.descriptor = descriptor;
	}

	public get leasedFrames(): number {
		return Array.from(this._frames).filter(frame => frame.editor !== undefined).length;
	}

	public get idleFrames(): number {
		return this._frames.size - this.leasedFrames;
	}

	public acquire(editor: VirtualizedIframeEmbeddedEditor): void {
		if (editor.frame) {
			editor.frame.bind(editor);
			return;
		}
		const idle = Array.from(this._frames).find(frame => frame.editor === undefined);
		const frame = idle ?? this._createFrame();
		frame.bind(editor);
	}

	public release(editor: VirtualizedIframeEmbeddedEditor): void {
		const frame = editor.frame;
		if (!frame || frame.editor !== editor || editor.hasFocus()) { return; }
		frame.unbind();
	}

	public park(iframe: HTMLIFrameElement): void {
		iframe.style.top = '-100000px';
		iframe.style.left = '0';
	}

	public dispose(): void {
		for (const frame of this._frames) {
			frame.dispose();
		}
		this._frames.clear();
	}

	public layout(): void {
		for (const frame of this._frames) {
			if (frame.editor) {
				frame.layout(frame.editor);
			}
		}
	}

	private _createFrame(): PhysicalIframe {
		const hostTransport = this.descriptor.hostTransport
			? this._provider.createHostTransport?.(this.descriptor.runtimeKey)
			: undefined;
		const frame = new PhysicalIframe(
			this,
			this.descriptor,
			hostTransport,
			this._frameLayer,
			this._frameRoot,
			this._scriptNonce,
			this._themeCss,
			this._iframeBootstrapUrl,
		);
		this._frames.add(frame);
		return frame;
	}
}

class PhysicalIframe implements IDisposable {
	public readonly iframe: HTMLIFrameElement;
	public editor: VirtualizedIframeEmbeddedEditor | undefined;
	public readonly pool: PhysicalIframePool;

	private _host: WebEditorHost | undefined;
	private _transport: WindowMessageTransport | undefined;
	private _pendingEditor: VirtualizedIframeEmbeddedEditor | undefined;
	private _reportedHeight: number | undefined;
	private _disposed = false;
	private readonly _onWindowMessage: (event: MessageEvent) => void;

	constructor(
		pool: PhysicalIframePool,
		private readonly _descriptor: ResolvedIframeEmbeddedEditor,
		private readonly _hostTransport: IframeEmbeddedEditorHostTransport | undefined,
		frameLayer: HTMLElement,
		private readonly _frameRoot: HTMLElement,
		private readonly _scriptNonce: string | undefined,
		private readonly _themeCss: string | (() => string) | undefined,
		private readonly _iframeBootstrapUrl: string | undefined,
	) {
		this.pool = pool;
		const iframe = document.createElement('iframe');
		iframe.setAttribute('sandbox', sandboxValue(_descriptor.sandbox));
		iframe.setAttribute('allow', _descriptor.sandbox?.clipboardWrite ? 'clipboard-write' : '');
		iframe.style.width = '100%';
		iframe.style.border = 'none';
		iframe.style.display = 'block';
		iframe.style.position = 'absolute';
		iframe.style.pointerEvents = 'auto';
		iframe.style.background = 'transparent';
		iframe.style.height = `${_descriptor.initialHeight ?? 120}px`;
		pool.park(iframe);
		iframe.addEventListener('blur', () => {
			const editor = this.editor;
			if (editor && !editor.visible) {
				this.pool.release(editor);
			}
		});
		this.iframe = iframe;
		this._onWindowMessage = event => {
			if (event.source !== iframe.contentWindow) { return; }
			const data = event.data as { type?: unknown; height?: unknown } | undefined;
			if (data?.type !== CONTROL_MESSAGE || typeof data.height !== 'number' || !Number.isFinite(data.height)) { return; }
			this._applyReportedHeight(data.height);
		};
		window.addEventListener('message', this._onWindowMessage);
		frameLayer.appendChild(iframe);
		queueMicrotask(() => this._setup());
	}

	public bind(editor: VirtualizedIframeEmbeddedEditor): void {
		if (this.editor === editor) {
			this._host?.setText(editor.content);
			this._host?.setReadOnly(editor.readOnly);
			editor.applyHeight(getIframeEmbeddedEditorBindingHeight(this._reportedHeight, editor.estimateHeight()));
			return;
		}
		if (this.editor && this.editor !== editor) {
			this.unbind();
		}
		this._pendingEditor = editor;
		if (this._host) {
			this._host.reuse(editor.content, editor.readOnly);
		}
		this.editor = editor;
		this._pendingEditor = undefined;
		editor.bindFrame(this);
		editor.applyHeight(getIframeEmbeddedEditorBindingHeight(this._reportedHeight, editor.estimateHeight()));
	}

	public unbind(): void {
		const editor = this.editor;
		if (!editor) { return; }
		const height = parseFloat(this.iframe.style.height) || this._descriptor.initialHeight || 120;
		this.editor = undefined;
		editor.unbindFrame(height);
		this.pool.park(this.iframe);
	}

	public layout(editor: VirtualizedIframeEmbeddedEditor): void {
		if (this.editor !== editor) { return; }
		const editorRect = editor.element.getBoundingClientRect();
		const rootRect = this._frameRoot.getBoundingClientRect();
		const isBody = this._frameRoot === document.body;
		const top = isBody
			? editorRect.top + window.scrollY
			: editorRect.top - rootRect.top + this._frameRoot.scrollTop;
		const left = isBody
			? editorRect.left + window.scrollX
			: editorRect.left - rootRect.left + this._frameRoot.scrollLeft;
		this.iframe.style.top = `${top}px`;
		this.iframe.style.left = `${left}px`;
		this.iframe.style.width = `${editorRect.width}px`;
	}

	public dispose(): void {
		if (this._disposed) { return; }
		this._disposed = true;
		this.unbind();
		window.removeEventListener('message', this._onWindowMessage);
		this._host?.dispose();
		this._transport?.dispose();
		this._hostTransport?.dispose();
		this.iframe.remove();
	}

	private _setup(): void {
		if (this._disposed) { return; }
		const contentWindow = this.iframe.contentWindow;
		if (!contentWindow) {
			requestAnimationFrame(() => this._setup());
			return;
		}
		this._transport = new WindowMessageTransport(window, contentWindow);
		const connection = new HubRpcConnection(JsonRpcChannel.create(this._transport));
		const editor = this._pendingEditor ?? this.editor;
		this._host = new WebEditorHost({
			connection,
			contentType: this._descriptor.contentType ?? 'text',
			initialText: editor?.content ?? '',
			readOnly: editor?.readOnly ?? false,
			hostTransport: this._hostTransport,
		});
		this._host.onDidChangeText(({ text }) => this.editor?.applyGuestText(text));
		this._host.onDidReportSize(({ height }) => this._applyReportedHeight(height));
		this.iframe.addEventListener('load', () => this._postTheme(), { once: true });
		const srcdoc = buildIframeEmbeddedEditorSrcdoc(
			this._descriptor.html,
			this._descriptor.resourceBaseUrl,
			this._getThemeCss(),
			this._scriptNonce,
		);
		if (this._iframeBootstrapUrl) {
			this.iframe.addEventListener('load', () => {
				const contentDocument = this.iframe.contentDocument;
				if (!contentDocument) {
					return;
				}
				contentDocument.open();
				contentDocument.write(srcdoc);
				contentDocument.close();
			}, { once: true });
			this.iframe.src = this._iframeBootstrapUrl;
		} else {
			this.iframe.srcdoc = srcdoc;
		}
	}

	private _getThemeCss(): string | undefined {
		return typeof this._themeCss === 'function' ? this._themeCss() : this._themeCss;
	}

	private _postTheme(): void {
		const themeCss = this._getThemeCss();
		if (themeCss !== undefined) {
			this.iframe.contentWindow?.postMessage({ type: CONTROL_MESSAGE, themeCss }, '*');
		}
	}

	private _applyReportedHeight(height: number): void {
		this._reportedHeight = clampIframeHeight(height);
		this.editor?.applyHeight(this._reportedHeight);
	}
}

function sandboxValue(options: IframeSandboxOptions | undefined): string {
	const values = ['allow-scripts', 'allow-same-origin'];
	if (options?.forms) { values.push('allow-forms'); }
	if (options?.downloads) { values.push('allow-downloads'); }
	if (options?.pointerLock) { values.push('allow-pointer-lock'); }
	return values.join(' ');
}

function clampIframeHeight(height: number): number {
	return Math.max(1, Math.min(MAX_IFRAME_HEIGHT, Math.ceil(height)));
}

export function getIframeEmbeddedEditorBindingHeight(reportedHeight: number | undefined, estimatedHeight: number): number {
	return clampIframeHeight(reportedHeight ?? estimatedHeight);
}

function descriptorRequestKey(providerId: string, infoString: string): string {
	return `${providerId}\0${infoString}`;
}

export function getIframeEmbeddedEditorPoolKey(
	providerId: string,
	descriptor: ResolvedIframeEmbeddedEditor,
): string {
	return [
		providerId,
		descriptor.runtimeKey,
		descriptor.html,
		descriptor.resourceBaseUrl ?? '',
		descriptor.hostTransport === true ? 'host-transport' : '',
		descriptor.contentType ?? 'text',
		sandboxValue(descriptor.sandbox),
		descriptor.sandbox?.clipboardWrite === true ? 'clipboard-write' : '',
	].join('\0');
}
