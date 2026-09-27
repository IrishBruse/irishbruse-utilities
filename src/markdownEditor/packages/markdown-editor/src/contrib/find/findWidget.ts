import { Disposable, autorun, observableValue } from '@vscode/observables';
import type { IObservable, IReader } from '@vscode/observables';
import type { EditorView } from '../../view/editorView.js';
import type { FindModel } from './findModel.js';

export interface FindWidgetOptions {
	readonly findModel: FindModel;
	readonly canFindInSelection: IObservable<boolean>;
	readonly onNext: () => void;
	readonly onPrevious: () => void;
	readonly onToggleFindInSelection: () => void;
	readonly onClose: () => void;
}

export class FindWidget extends Disposable {
	readonly element: HTMLElement;
	readonly panelElement: HTMLElement;
	readonly focused = observableValue<boolean>(this, false);

	private readonly _inputShell: HTMLElement;
	private readonly _input: HTMLTextAreaElement;
	private readonly _matchesCount: HTMLElement;
	private readonly _previousButton: HTMLButtonElement;
	private readonly _nextButton: HTMLButtonElement;
	private readonly _selectionButton: HTMLButtonElement;
	private readonly _caseButton: HTMLButtonElement;
	private readonly _wholeWordButton: HTMLButtonElement;
	private readonly _regexButton: HTMLButtonElement;
	private readonly _error: HTMLElement;

	constructor(
		private readonly _view: EditorView,
		private readonly _options: FindWidgetOptions,
	) {
		super();

		this.element = document.createElement('div');
		this.element.className = 'md-find-widget-host';
		this.element.hidden = true;

		this.panelElement = document.createElement('div');
		this.panelElement.className = 'md-find-widget';
		this.panelElement.setAttribute('role', 'dialog');
		this.panelElement.setAttribute('aria-label', 'Find');
		this.element.appendChild(this.panelElement);

		const row = document.createElement('div');
		row.className = 'md-find-row';
		this.panelElement.appendChild(row);

		this._inputShell = document.createElement('div');
		this._inputShell.className = 'md-find-input-shell';
		row.appendChild(this._inputShell);

		this._input = document.createElement('textarea');
		this._input.className = 'md-find-input';
		this._input.rows = 1;
		this._input.spellcheck = false;
		this._input.setAttribute('aria-label', 'Find');
		this._input.placeholder = 'Find';
		this._inputShell.appendChild(this._input);

		const options = document.createElement('div');
		options.className = 'md-find-options';
		this._inputShell.appendChild(options);
		this._caseButton = createTextToggle('Aa', 'Match Case');
		this._wholeWordButton = createTextToggle('ab', 'Match Whole Word', 'md-find-option-whole-word');
		this._regexButton = createTextToggle('.*', 'Use Regular Expression');
		options.append(this._caseButton, this._wholeWordButton, this._regexButton);

		this._matchesCount = document.createElement('div');
		this._matchesCount.className = 'md-find-count';
		this._matchesCount.setAttribute('role', 'status');
		this._matchesCount.setAttribute('aria-live', 'polite');
		row.appendChild(this._matchesCount);

		this._previousButton = createIconButton('arrow-up', 'Previous Match');
		this._nextButton = createIconButton('arrow-down', 'Next Match');
		this._selectionButton = createIconButton('selection', 'Find in Selection');
		const closeButton = createIconButton('close', 'Close');
		row.append(this._previousButton, this._nextButton, this._selectionButton, closeButton);

		this._error = document.createElement('div');
		this._error.className = 'md-find-error';
		this._error.setAttribute('role', 'alert');
		this.panelElement.appendChild(this._error);

		const onInput = (): void => this._options.findModel.searchString.set(this._input.value, undefined);
		const onInputKeyDown = (event: KeyboardEvent): void => {
			if (event.isComposing) { return; }
			if (event.key === 'Enter' && !event.ctrlKey && !event.metaKey && !event.altKey) {
				event.preventDefault();
				event.stopPropagation();
				if (event.shiftKey) { this._options.onPrevious(); }
				else { this._options.onNext(); }
			}
		};
		const onWidgetKeyDown = (event: KeyboardEvent): void => {
			if (event.key === 'Escape' && !event.isComposing) {
				event.preventDefault();
				event.stopPropagation();
				this._options.onClose();
			}
		};
		const onPointerDown = (event: PointerEvent): void => event.stopPropagation();
		const onFocusIn = (): void => this.focused.set(true, undefined);
		const onFocusOut = (event: FocusEvent): void => {
			const next = event.relatedTarget;
			if (next instanceof Node && this.panelElement.contains(next)) { return; }
			this.focused.set(false, undefined);
		};

		this._input.addEventListener('input', onInput);
		this._input.addEventListener('keydown', onInputKeyDown);
		this.panelElement.addEventListener('keydown', onWidgetKeyDown);
		this.panelElement.addEventListener('pointerdown', onPointerDown);
		this.panelElement.addEventListener('focusin', onFocusIn);
		this.panelElement.addEventListener('focusout', onFocusOut);
		this._register({
			dispose: () => {
				this._input.removeEventListener('input', onInput);
				this._input.removeEventListener('keydown', onInputKeyDown);
				this.panelElement.removeEventListener('keydown', onWidgetKeyDown);
				this.panelElement.removeEventListener('pointerdown', onPointerDown);
				this.panelElement.removeEventListener('focusin', onFocusIn);
				this.panelElement.removeEventListener('focusout', onFocusOut);
			},
		});

		this._registerButton(this._caseButton, () =>
			this._options.findModel.matchCase.set(!this._options.findModel.matchCase.get(), undefined));
		this._registerButton(this._wholeWordButton, () =>
			this._options.findModel.wholeWord.set(!this._options.findModel.wholeWord.get(), undefined));
		this._registerButton(this._regexButton, () =>
			this._options.findModel.isRegex.set(!this._options.findModel.isRegex.get(), undefined));
		this._registerButton(this._previousButton, this._options.onPrevious);
		this._registerButton(this._nextButton, this._options.onNext);
		this._registerButton(this._selectionButton, this._options.onToggleFindInSelection);
		this._registerButton(closeButton, this._options.onClose);

		this._register(this._view.mountOverlay(this.element, 'top-chrome'));
		this._register(this._view.registerRevealOcclusion(this.panelElement));
		this._register(this._view.suspendEditContextWhileFocused(this.panelElement));
		this._register(autorun(reader => this._render(reader)));
	}

	focusAndSelect(): void {
		this._input.focus({ preventScroll: true });
		this._input.select();
	}

	private _registerButton(button: HTMLButtonElement, listener: () => void): void {
		button.addEventListener('click', listener);
		this._register({ dispose: () => button.removeEventListener('click', listener) });
	}

	private _render(reader: IReader): void {
		const model = this._options.findModel;
		const isRevealed = model.isRevealed.read(reader);
		if (!isRevealed && this.panelElement.contains(this.panelElement.ownerDocument.activeElement)) {
			this._view.focus();
		}
		this.element.hidden = !isRevealed;
		this._view.element.classList.toggle('md-find-visible', isRevealed);
		if (!isRevealed) { return; }

		const searchString = model.searchString.read(reader);
		const matchCase = model.matchCase.read(reader);
		const wholeWord = model.wholeWord.read(reader);
		const isRegex = model.isRegex.read(reader);
		const searchScope = model.searchScope.read(reader);
		const searchResult = model.searchResult.read(reader);
		const currentMatchPosition = model.currentMatchPosition.read(reader);
		const canFindInSelection = this._options.canFindInSelection.read(reader)
			|| searchScope !== undefined;
		if (this._input.value !== searchString) {
			this._input.value = searchString;
		}
		setPressed(this._caseButton, matchCase);
		setPressed(this._wholeWordButton, wholeWord);
		setPressed(this._regexButton, isRegex);
		setPressed(this._selectionButton, searchScope !== undefined);

		this._selectionButton.disabled = !isRevealed || !canFindInSelection;

		const count = searchResult.kind === 'valid' ? searchResult.matches.length : 0;
		const hasMatches = count > 0;
		const hasQuery = searchString.length > 0;
		this._previousButton.disabled = !isRevealed || !hasMatches;
		this._nextButton.disabled = !isRevealed || !hasMatches;
		this.panelElement.classList.toggle('md-find-no-results', hasQuery && !hasMatches && searchResult.kind === 'valid');

		if (!hasMatches) {
			this._matchesCount.textContent = 'No results';
		} else {
			const countLabel = searchResult.kind === 'valid' && searchResult.isCapped ? `${count}+` : String(count);
			this._matchesCount.textContent = `${currentMatchPosition || '?'} of ${countLabel}`;
		}

		const error = searchResult.kind === 'invalid' ? searchResult.error.message : '';
		this._input.setAttribute('aria-invalid', String(error.length > 0));
		this._inputShell.classList.toggle('md-find-input-invalid', error.length > 0);
		this._input.title = error;
		this._error.textContent = error;
		this._error.hidden = error.length === 0;
	}
}

function createTextToggle(text: string, label: string, extraClass?: string): HTMLButtonElement {
	const button = document.createElement('button');
	button.type = 'button';
	button.className = 'md-find-button md-find-option';
	if (extraClass) { button.classList.add(extraClass); }
	button.textContent = text;
	button.setAttribute('aria-label', label);
	button.title = label;
	button.setAttribute('aria-pressed', 'false');
	return button;
}

function createIconButton(icon: string, label: string): HTMLButtonElement {
	const button = document.createElement('button');
	button.type = 'button';
	button.className = 'md-find-button';
	button.setAttribute('aria-label', label);
	button.title = label;
	const iconElement = document.createElement('span');
	iconElement.className = `codicon codicon-${icon}`;
	iconElement.setAttribute('aria-hidden', 'true');
	button.appendChild(iconElement);
	return button;
}

function setPressed(button: HTMLButtonElement, pressed: boolean): void {
	button.setAttribute('aria-pressed', String(pressed));
	button.classList.toggle('md-find-option-active', pressed);
}
