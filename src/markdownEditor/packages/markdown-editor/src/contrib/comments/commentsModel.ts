import { observableValue, type IObservable } from '@vscode/observables';
import type { OffsetRange } from '../../core/offsetRange.js';

/** A persistent comment anchored to a source range. */
export interface Comment {
	readonly id: string;
	/** Source range the comment refers to (its highlighted region). */
	readonly range: OffsetRange;
	/** The comment text. */
	readonly body: string;
	/** Display name of the author, if any. */
	readonly author?: string;
	/** Creation time (epoch ms), used to render a relative timestamp. */
	readonly createdAt?: number;
}

/**
 * Seedable store of {@link Comment}s for the comment-mode contribution. It has
 * no opinion on rendering or persistence — a host seeds it via
 * {@link set}/{@link add} and observes {@link comments}.
 */
export class CommentsModel {
	private readonly _comments = observableValue<readonly Comment[]>(this, []);
	/** Monotonic counter for ids of comments created via {@link create}. */
	private _sequence = 0;
	/** The current comments, in insertion order. */
	get comments(): IObservable<readonly Comment[]> { return this._comments; }

	/** Replace the whole comment set. */
	set(comments: readonly Comment[]): void {
		this._comments.set(comments, undefined);
	}

	/**
	 * Create a comment from a user submission and append it, generating its `id`
	 * and `createdAt` here so id/time allocation stays the store's concern (the
	 * UI only supplies the range and text). Returns the created comment.
	 */
	create(input: { range: OffsetRange; body: string; author?: string }): Comment {
		const comment: Comment = {
			id: `comment-${++this._sequence}`,
			range: input.range,
			body: input.body,
			author: input.author,
			createdAt: Date.now(),
		};
		this.add(comment);
		return comment;
	}

	/** Append a comment. */
	add(comment: Comment): void {
		this._comments.set([...this._comments.get(), comment], undefined);
	}

	/** Remove a comment by id. */
	remove(id: string): void {
		this._comments.set(this._comments.get().filter(c => c.id !== id), undefined);
	}
}
