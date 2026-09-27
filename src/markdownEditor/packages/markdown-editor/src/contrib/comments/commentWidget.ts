import { createCommentIcon } from './commentIcons.js';

export interface CommentWidgetOptions {
	/** The posted comment body. */
	readonly body: string;
	/** If provided, shows a delete action and invokes it when activated. */
	readonly onDelete?: () => void;
}

/** Compact posted state for a markdown comment. */
export class CommentWidget {
	private readonly _domNode: HTMLElement;
	private readonly _disposables: (() => void)[] = [];

	get element(): HTMLElement { return this._domNode; }

	constructor(options: CommentWidgetOptions) {
		this._domNode = document.createElement('div');
		this._domNode.className = 'md-comment-widget';

		const text = document.createElement('span');
		text.className = 'md-comment-widget-text';
		text.textContent = options.body;
		this._domNode.appendChild(text);

		if (options.onDelete) {
			const deleteButton = document.createElement('button');
			deleteButton.type = 'button';
			deleteButton.className = 'md-comment-widget-delete';
			deleteButton.title = 'Delete comment';
			deleteButton.setAttribute('aria-label', 'Delete comment');
			deleteButton.appendChild(createCommentIcon('trash'));

			const onDelete = (event: MouseEvent): void => {
				event.preventDefault();
				event.stopPropagation();
				options.onDelete?.();
			};
			deleteButton.addEventListener('click', onDelete);
			this._disposables.push(() => deleteButton.removeEventListener('click', onDelete));
			this._domNode.appendChild(deleteButton);
		}
	}

	dispose(): void {
		for (const dispose of this._disposables) {
			dispose();
		}
		this._domNode.remove();
	}
}
