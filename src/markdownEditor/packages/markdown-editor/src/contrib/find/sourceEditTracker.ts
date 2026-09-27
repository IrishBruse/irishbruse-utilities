import type { StringValue } from '../../core/stringValue.js';
import type { EditorModel, SourceEditEvent } from '../../model/editorModel.js';

interface PendingSourceEditChain {
	readonly baseSourceTextId: number;
	readonly resultSourceTextId: number;
	readonly isContinuous: boolean;
}

interface SourceEditConsumption {
	readonly sourceIdentityChanged: boolean;
	readonly isExpected: boolean;
}

export class SourceEditTracker {
	private _observedSourceTextId: number;
	private _pending: PendingSourceEditChain | undefined;

	constructor(private readonly _editorModel: EditorModel) {
		this._observedSourceTextId = this._editorModel.getSourceTextId(this._editorModel.sourceText.get());
	}

	record(event: SourceEditEvent): void {
		const pending = this._pending;
		this._pending = pending
			? {
				baseSourceTextId: pending.baseSourceTextId,
				resultSourceTextId: event.resultSourceTextId,
				isContinuous: pending.isContinuous && pending.resultSourceTextId === event.baseSourceTextId,
			}
			: {
				baseSourceTextId: event.baseSourceTextId,
				resultSourceTextId: event.resultSourceTextId,
				isContinuous: true,
			};
	}

	consume(sourceText: StringValue): SourceEditConsumption {
		const sourceTextId = this._editorModel.getSourceTextId(sourceText);
		const pending = this._pending;
		this._pending = undefined;
		const sourceIdentityChanged = sourceTextId !== this._observedSourceTextId;
		const isExpected = pending !== undefined
			&& pending.isContinuous
			&& pending.baseSourceTextId === this._observedSourceTextId
			&& pending.resultSourceTextId === sourceTextId;
		this._observedSourceTextId = sourceTextId;
		return { sourceIdentityChanged, isExpected };
	}
}
