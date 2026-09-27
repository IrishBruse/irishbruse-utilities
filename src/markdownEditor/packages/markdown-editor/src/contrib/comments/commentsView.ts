/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable, autorun, type IObservable } from '@vscode/observables';
import type { EditorView } from '../../view/editorView.js';
import type { SelectionRect } from '../../view/parts/selectionView.js';
import { CommentWidget } from './commentWidget.js';
import type { Comment, CommentsModel } from './commentsModel.js';
import { layoutRightAlignedStack, type StackItem } from './commentsLayout.js';
import './commentWidget.css';

interface CommentEntry {
	readonly widget: CommentWidget;
	readonly rects: IObservable<readonly SelectionRect[]>;
}

/** Displays posted comments beside their source ranges. */
export class CommentsView extends Disposable {
	private readonly _layer: HTMLElement;
	private readonly _entries = new Map<string, CommentEntry>();
	private _order: readonly string[] = [];
	private _pendingRevealCommentId: string | undefined;

	constructor(
		private readonly _model: CommentsModel,
		private readonly _view: EditorView,
	) {
		super();

		this._layer = document.createElement('div');
		this._layer.className = 'md-comments-layer';
		this._layer.style.position = 'absolute';
		this._layer.style.inset = '0';
		this._layer.style.pointerEvents = 'none';
		this._layer.style.overflow = 'visible';
		this._layer.style.background = 'transparent';
		this._view.overlayContainer.appendChild(this._layer);

		this._register({
			dispose: () => {
				for (const entry of this._entries.values()) {
					entry.widget.dispose();
				}
				this._entries.clear();
				this._layer.remove();
			},
		});

		this._register(autorun(reader => {
			const comments = this._model.comments.read(reader);
			this._reconcile(comments);
			for (const comment of comments) {
				this._entries.get(comment.id)!.rects.read(reader);
			}
			this._relayout();
		}));

		const resizeObserver = new ResizeObserver(() => this._relayout());
		resizeObserver.observe(this._view.element);
		this._register({ dispose: () => resizeObserver.disconnect() });
	}

	revealComment(id: string): void {
		this._pendingRevealCommentId = id;
		this._revealPendingComment();
	}

	private _reconcile(comments: readonly Comment[]): void {
		this._order = comments.map(comment => comment.id);
		const seen = new Set(this._order);

		for (const comment of comments) {
			if (this._entries.has(comment.id)) {
				continue;
			}
			const widget = new CommentWidget({
				body: comment.body,
				onDelete: () => this._model.remove(comment.id),
			});
			widget.element.style.position = 'absolute';
			widget.element.style.pointerEvents = 'auto';
			this._layer.appendChild(widget.element);
			this._entries.set(comment.id, {
				widget,
				rects: this._view.rangeRects(comment.range),
			});
		}

		for (const [id, entry] of this._entries) {
			if (!seen.has(id)) {
				entry.widget.dispose();
				this._entries.delete(id);
			}
		}
	}

	private _relayout(): void {
		const items: StackItem[] = this._order
			.map(id => this._entries.get(id))
			.filter((entry): entry is CommentEntry => entry !== undefined)
			.map(entry => ({ element: entry.widget.element, rects: entry.rects.get() }));
		layoutRightAlignedStack(this._view, items);
		this._revealPendingComment();
	}

	private _revealPendingComment(): void {
		const id = this._pendingRevealCommentId;
		if (!id) {
			return;
		}
		const element = this._entries.get(id)?.widget.element;
		if (!element || element.style.visibility === 'hidden') {
			return;
		}
		this._pendingRevealCommentId = undefined;
		element.scrollIntoView({ block: 'center', inline: 'nearest' });
	}
}
