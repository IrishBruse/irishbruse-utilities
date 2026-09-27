import { Disposable, autorun, observableValue, type IObservable } from '@vscode/observables';
import { createCommentIcon } from './commentIcons.js';

const MIN_INPUT_WIDTH = 165;
const MAX_INPUT_WIDTH = 400;
const INPUT_CHROME_WIDTH = 33;

export interface CommentInputWidgetOptions {
	/** Placeholder shown while the textarea is empty. Defaults to "Add comment". */
	readonly placeholder?: string;
	/** Called after the textarea changes size. */
	readonly onDidChangeSize?: () => void;
	/**
	 * Called when the user submits a non-empty comment (Enter or the add button).
	 * The text is trimmed; never called with an empty string.
	 */
	readonly onSubmit?: (text: string) => void;
	/** Called when the user dismisses the input (Escape). */
	readonly onCancel?: () => void;
}

/**
 * The compact editing state for a markdown comment.
 *
 * The widget owns its DOM and draft state but not its position. The comment-mode
 * controller mounts it next to the active selection.
 */
export class CommentInputWidget extends Disposable {
	readonly element: HTMLElement;

	private readonly _textarea: HTMLTextAreaElement;
	private readonly _measure: HTMLSpanElement;
	private readonly _submitButton: HTMLButtonElement;

	private readonly _value = observableValue<string>(this, '');
	/** Live, untrimmed textarea content. */
	get value(): IObservable<string> { return this._value; }

	/** The raw textarea, exposed so a host can move focus into it. */
	get inputElement(): HTMLTextAreaElement { return this._textarea; }

	constructor(private readonly _options?: CommentInputWidgetOptions) {
		super();

		this.element = document.createElement('div');
		this.element.className = 'md-comment-input';

		this._textarea = document.createElement('textarea');
		this._textarea.className = 'md-comment-input-textarea';
		this._textarea.rows = 1;
		this._textarea.placeholder = _options?.placeholder ?? 'Add comment';
		this._textarea.setAttribute('aria-label', this._textarea.placeholder);
		this.element.appendChild(this._textarea);

		this._measure = document.createElement('span');
		this._measure.className = 'md-comment-input-measure';
		this._measure.setAttribute('aria-hidden', 'true');
		this.element.appendChild(this._measure);

		this._submitButton = document.createElement('button');
		this._submitButton.type = 'button';
		this._submitButton.className = 'md-comment-input-submit';
		this._submitButton.title = 'Add comment';
		this._submitButton.setAttribute('aria-label', 'Add comment');
		this._submitButton.appendChild(createCommentIcon('add'));
		this.element.appendChild(this._submitButton);

		const onPanelPointerDown = (event: PointerEvent): void => {
			event.stopPropagation();
			if (event.target === this._textarea || this._submitButton.contains(event.target as Node)) {
				return;
			}
			event.preventDefault();
			this._textarea.focus();
		};
		this.element.addEventListener('pointerdown', onPanelPointerDown);
		this._register({ dispose: () => this.element.removeEventListener('pointerdown', onPanelPointerDown) });

		const onInput = (): void => {
			this._value.set(this._textarea.value, undefined);
			this._autoSize();
		};
		this._textarea.addEventListener('input', onInput);
		this._register({ dispose: () => this._textarea.removeEventListener('input', onInput) });

		const onKeyDown = (event: KeyboardEvent): void => {
			event.stopPropagation();
			if (event.key === 'Escape') {
				event.preventDefault();
				this._options?.onCancel?.();
				return;
			}
			if (event.key === 'Enter' && !event.shiftKey) {
				event.preventDefault();
				this._submit();
			}
		};
		this._textarea.addEventListener('keydown', onKeyDown);
		this._register({ dispose: () => this._textarea.removeEventListener('keydown', onKeyDown) });

		const onSubmitClick = (): void => this._submit();
		this._submitButton.addEventListener('click', onSubmitClick);
		this._register({ dispose: () => this._submitButton.removeEventListener('click', onSubmitClick) });

		this._register(autorun(reader => {
			const hasText = this._value.read(reader).trim().length > 0;
			this._submitButton.disabled = !hasText;
			this.element.classList.toggle('md-comment-input-empty', !hasText);
		}));

		this._autoSize();
	}

	focus(): void {
		this._textarea.focus();
		const end = this._textarea.value.length;
		this._textarea.setSelectionRange(end, end);
	}

	setText(text: string): void {
		this._textarea.value = text;
		this._value.set(text, undefined);
		this._autoSize();
	}

	clear(): void {
		this.setText('');
	}

	private _submit(): void {
		const text = this._textarea.value.trim();
		if (!text) {
			return;
		}
		this._options?.onSubmit?.(text);
	}

	private _autoSize(): void {
		this._measure.textContent = this._textarea.value || this._textarea.placeholder;
		const desiredWidth = this._measure.scrollWidth + INPUT_CHROME_WIDTH;
		this.element.style.width = `${Math.min(Math.max(MIN_INPUT_WIDTH, desiredWidth), MAX_INPUT_WIDTH)}px`;

		this._textarea.style.height = 'auto';
		const scrollHeight = this._textarea.scrollHeight;
		if (scrollHeight > 0) {
			this._textarea.style.height = `${Math.min(scrollHeight, 160)}px`;
			this._textarea.style.overflowY = scrollHeight > 160 ? 'auto' : 'hidden';
		}
		this._options?.onDidChangeSize?.();
	}
}
