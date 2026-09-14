import { observableValue, type ISettableObservable } from '../core/observable';

interface IHighlightToken {
	readonly length: number;
	readonly foreground: number;
	readonly fontStyle: number;
}

interface IHighlightResult {
	readonly tokens: readonly IHighlightToken[];
	readonly colorMap: readonly string[];
}

interface IRenderToken {
	readonly length: number;
	readonly className: string | undefined;
}

function fontStyleRules(): string {
	const rules: string[] = [];
	for (let fontStyle = 1; fontStyle <= 15; fontStyle++) {
		const declarations: string[] = [];
		if (fontStyle & 1) { declarations.push('font-style: italic;'); }
		if (fontStyle & 2) { declarations.push('font-weight: bold;'); }
		const decorations: string[] = [];
		if (fontStyle & 4) { decorations.push('underline'); }
		if (fontStyle & 8) { decorations.push('line-through'); }
		if (decorations.length) { declarations.push(`text-decoration: ${decorations.join(' ')};`); }
		rules.push(`.tok-mdhl-fs-${fontStyle} { ${declarations.join(' ')} }`);
	}
	return rules.join('\n');
}

function colorRules(colorMap: readonly string[]): string {
	return colorMap
		.map((color, index) => color ? `.tok-mdhl-fg-${index} { color: ${color}; }` : '')
		.filter((rule) => rule.length > 0)
		.join('\n');
}

function classNameFor(foreground: number, fontStyle: number): string | undefined {
	const parts: string[] = [];
	if (foreground > 0) { parts.push(`mdhl-fg-${foreground}`); }
	if (fontStyle > 0) { parts.push(`mdhl-fs-${fontStyle}`); }
	return parts.length ? parts.join('.') : undefined;
}

function unstyledTokens(length: number): readonly IRenderToken[] {
	return length > 0 ? [{ length, className: undefined }] : [];
}

export class HighlighterDocument {
	#text: string;
	#tokens: readonly IRenderToken[];
	readonly snapshot: ISettableObservable<{ tokens: readonly IRenderToken[] }>;
	readonly #owner: WebviewSyntaxHighlighter;
	readonly #languageId: string;

	constructor(
		owner: WebviewSyntaxHighlighter,
		languageId: string,
		initialText: string,
	) {
		this.#owner = owner;
		this.#languageId = languageId;
		this.#text = initialText;
		this.#tokens = unstyledTokens(initialText.length);
		this.snapshot = observableValue('mdSyntaxHighlight', { tokens: this.#tokens });
		void this.#request(initialText);
	}

	update(text: string): void {
		this.#text = text;
		this.#tokens = unstyledTokens(text.length);
		this.snapshot.set({ tokens: this.#tokens }, undefined);
		void this.#request(text);
	}

	refresh(): void {
		void this.#request(this.#text);
	}

	dispose(): void {
		this.#owner._remove(this);
	}

	async #request(text: string): Promise<void> {
		const result = await this.#owner.request(text, this.#languageId);
		if (text !== this.#text) {
			return;
		}
		this.#tokens = result.tokens.map(token => ({ length: token.length, className: classNameFor(token.foreground, token.fontStyle) }));
		this.snapshot.set({ tokens: this.#tokens }, undefined);
	}
}

export class WebviewSyntaxHighlighter {
	#nextRequestId = 0;
	readonly #pending = new Map<number, (result: IHighlightResult) => void>();
	readonly #documents = new Set<HighlighterDocument>();
	readonly #styleElement: HTMLStyleElement;
	readonly #postMessage: (message: unknown) => void;

	constructor(postMessage: (message: unknown) => void) {
		this.#postMessage = postMessage;
		this.#styleElement = document.createElement('style');
		this.#styleElement.textContent = fontStyleRules();
		document.head.appendChild(this.#styleElement);
	}

	create(languageId: string, initialText: string): HighlighterDocument {
		const document = new HighlighterDocument(this, languageId, initialText);
		this.#documents.add(document);
		return document;
	}

	request(source: string, languageId: string): Promise<IHighlightResult> {
		const requestId = this.#nextRequestId++;
		return new Promise<IHighlightResult>(resolve => {
			this.#pending.set(requestId, resolve);
			this.#postMessage({ type: 'highlight', requestId, source, languageId });
		});
	}

	handleMessage(message: { readonly type: string; readonly requestId?: number; readonly tokens?: readonly IHighlightToken[]; readonly colorMap?: readonly string[] }): boolean {
		switch (message.type) {
			case 'highlightResult': {
				const resolve = this.#pending.get(message.requestId!);
				if (resolve) {
					this.#pending.delete(message.requestId!);
					this.#updateColors(message.colorMap!);
					resolve({ tokens: message.tokens!, colorMap: message.colorMap! });
				}
				return true;
			}
			case 'highlightThemeChanged': {
				for (const document of this.#documents) {
					document.refresh();
				}
				return true;
			}
			default:
				return false;
		}
	}

	_remove(document: HighlighterDocument): void {
		this.#documents.delete(document);
	}

	#updateColors(colorMap: readonly string[]): void {
		this.#styleElement.textContent = `${fontStyleRules()}\n${colorRules(colorMap)}`;
	}
}
