import { Disposable, autorun, derived, observableValue, transaction } from '@vscode/observables';
import type { IDisposable } from '@vscode/observables';
import { OffsetRange } from '../../core/offsetRange.js';
import { Selection } from '../../core/selection.js';
import { findWordAt } from '../../core/wordUtils.js';
import { blocksIntersecting, type EditorModel } from '../../model/editorModel.js';
import type { DocumentViewNode } from '../../view/content/documentView.js';
import { mappedRangesForOffsets } from '../../view/diffHighlight.js';
import type { EditorView } from '../../view/editorView.js';
import type { KeyboardPlatform } from '../../view/keyboardNavigation.js';
import { FindHighlightsView } from './findHighlightsView.js';
import { FindModel, type FindDirection } from './findModel.js';
import { SourceEditTracker } from './sourceEditTracker.js';
import { FindWidget } from './findWidget.js';
import { escapeFindRegex } from './searchEngine.js';

export interface FindControllerOptions {
	readonly keyboardPlatform: KeyboardPlatform;
}

interface FindQuerySeed {
	readonly searchString: string;
	readonly origin: number;
}

export class FindController extends Disposable {
	readonly model: FindModel;
	readonly widget: FindWidget;

	private readonly _selectionForScope = observableValue<Selection | undefined>(this, undefined);
	private _forcedMatch: OffsetRange | undefined;
	private _selectedMatch: OffsetRange | undefined;
	private _observedSourceTextId: number;
	private readonly _sourceEditTracker: SourceEditTracker;
	private _revealRequest: IDisposable | undefined;

	constructor(
		private readonly _editorModel: EditorModel,
		private readonly _view: EditorView,
		private readonly _options: FindControllerOptions,
	) {
		super();
		this._observedSourceTextId = this._editorModel.getSourceTextId(this._editorModel.sourceText.get());
		this._sourceEditTracker = new SourceEditTracker(this._editorModel);

		this.model = this._register(new FindModel(this._editorModel));
		this._register(this._editorModel.onWillApplySourceEdit(event => {
			this._sourceEditTracker.record(event);
		}));
		const canFindInSelection = derived(this, reader => {
			const selection = this._selectionForScope.read(reader);
			return !!selection && !selection.isCollapsed;
		});
		this.widget = this._register(new FindWidget(this._view, {
			findModel: this.model,
			canFindInSelection,
			onNext: () => { this.model.moveToNextMatch(); },
			onPrevious: () => { this.model.moveToPreviousMatch(); },
			onToggleFindInSelection: () => this._toggleFindInSelection(),
			onClose: () => this.close(),
		}));
		this._register(new FindHighlightsView(this._view, this.model));

		const onKeyDown = (event: KeyboardEvent): void => this._handleKeyDown(event);
		this._view.element.addEventListener('keydown', onKeyDown, true);
		this._register({
			dispose: () => this._view.element.removeEventListener('keydown', onKeyDown, true),
		});

		this._register(autorun(reader => {
			const focused = this.widget.focused.read(reader);
			this._view.element.classList.toggle('md-find-widget-focused', focused);
		}));

		let previousSelection = this._editorModel.selection.get();
		this._register(autorun(reader => {
			const sourceText = this._editorModel.sourceText.read(reader);
			const selection = this._editorModel.selection.read(reader);
			const sourceChange = this._sourceEditTracker.consume(sourceText);
			const selectionChanged = selection !== previousSelection;
			previousSelection = selection;
			if (!selectionChanged) { return; }
			const current = this.model.currentMatch.get();
			if (!selection || (current && selection.range.equals(current))) { return; }
			this._selectionForScope.set(selection, undefined);
			this.model.setSearchOrigin(selection.active);
			if (!sourceChange.isExpected) {
				this.model.currentMatch.set(undefined, undefined);
			}
		}));

		this._register(autorun(reader => {
			const sourceText = this._editorModel.sourceText.read(reader);
			const sourceTextId = this._editorModel.getSourceTextId(sourceText);
			const sourceChanged = sourceTextId !== this._observedSourceTextId;
			const revealed = this.model.isRevealed.read(reader);
			const match = this.model.currentMatch.read(reader);
			this._view.element.classList.toggle('md-find-has-current-match', revealed && match !== undefined);
			const document = this._editorModel.document.read(reader);
			const documentView = this._view.documentViewNode.read(reader);

			if (!revealed || !match) {
				this._forcedMatch = undefined;
				this._selectedMatch = undefined;
				this._observedSourceTextId = sourceTextId;
				this._cancelRevealRequest();
				this._setForcedMarkerVisibleBlocks(new Set());
				return;
			}

			const matchChanged = !this._selectedMatch?.equals(match);
			let forcedBlocks: ReadonlySet<ReturnType<typeof blocksIntersecting>[number]> = new Set();
			if (!this._forcedMatch?.equals(match)) {
				const fullyRendered = documentView ? isFullyRendered(documentView, match) : false;
				if (!fullyRendered) {
					forcedBlocks = new Set(blocksIntersecting(document, match.start, match.endExclusive));
					this._forcedMatch = match;
				} else {
					this._forcedMatch = undefined;
				}
			} else {
				forcedBlocks = new Set(blocksIntersecting(document, match.start, match.endExclusive));
			}

			transaction(tx => {
				if (!sameBlockSet(this._view.forcedMarkerVisibleBlocks.get(), forcedBlocks)) {
					this._view.forcedMarkerVisibleBlocks.set(forcedBlocks, tx);
				}
				const selection = this._editorModel.selection.get();
				if (matchChanged && !sourceChanged && (!selection || !selection.range.equals(match))) {
					this._editorModel.pendingParagraph.set(undefined, tx);
					this._editorModel.selectionSource.set('find', tx);
					this._editorModel.selection.set(new Selection(match.start, match.endExclusive), tx);
				}
			});
			this._selectedMatch = match;
			this._observedSourceTextId = sourceTextId;
			if (matchChanged && !sourceChanged) {
				this._cancelRevealRequest();
				this._revealRequest = this._view.revealRangeInCenterIfOutsideViewport(match, 'auto');
			}
		}));

		this._register({
			dispose: () => {
				this._cancelRevealRequest();
				this._view.element.classList.remove('md-find-visible', 'md-find-widget-focused', 'md-find-has-current-match');
				this._view.forcedMarkerVisibleBlocks.set(new Set(), undefined);
			},
		});
	}

	private _setForcedMarkerVisibleBlocks(blocks: ReadonlySet<ReturnType<typeof blocksIntersecting>[number]>): void {
		if (!sameBlockSet(this._view.forcedMarkerVisibleBlocks.get(), blocks)) {
			this._view.forcedMarkerVisibleBlocks.set(blocks, undefined);
		}
	}

	openAndFocus(): void {
		if (this.model.isRevealed.get()) {
			this.widget.focusAndSelect();
			return;
		}
		const selection = this._editorModel.selection.get() ?? Selection.collapsed(0);
		this._selectionForScope.set(selection, undefined);
		const { searchString, origin } = this._querySeed(selection, this.model.searchString.get());
		this.model.reveal({
			origin,
			searchString,
			direction: 'next',
		});
		this.widget.focusAndSelect();
	}

	close(): void {
		if (!this.model.isRevealed.get()) { return; }
		this._cancelRevealRequest();
		this.model.hide();
		this._view.focus();
	}

	private _handleKeyDown(event: KeyboardEvent): void {
		if (event.isComposing || event.getModifierState('AltGraph')) { return; }
		const target = event.target;
		const inWidget = target instanceof Node && this.widget.panelElement.contains(target);
		if (target !== this._view.element && !inWidget) { return; }

		if (isFindChord(event, this._options.keyboardPlatform)) {
			consume(event);
			this.openAndFocus();
			return;
		}

		if (event.key === 'F3' && !event.altKey && !event.ctrlKey && !event.metaKey) {
			consume(event);
			this._findByKeyboard(event.shiftKey ? 'previous' : 'next');
			return;
		}

		if (event.key === 'Escape' && this.model.isRevealed.get()) {
			consume(event);
			this.close();
		}
	}

	private _cancelRevealRequest(): void {
		this._revealRequest?.dispose();
		this._revealRequest = undefined;
	}

	private _findByKeyboard(direction: FindDirection): void {
		if (this.model.isRevealed.get()) {
			if (direction === 'next') { this.model.moveToNextMatch(); }
			else { this.model.moveToPreviousMatch(); }
			return;
		}

		const selection = this._editorModel.selection.get() ?? Selection.collapsed(0);
		this._selectionForScope.set(selection, undefined);
		const query = this.model.searchString.get() || this._querySeed(selection).searchString;
		const origin = direction === 'next' ? selection.range.endExclusive : selection.range.start;
		this.model.reveal({ origin, searchString: query, direction });
	}

	private _querySeed(selection: Selection, retainedQuery?: string): FindQuerySeed {
		const selected = this._selectedSingleLineText(selection);
		if (selected) {
			return {
				searchString: this._prepareSeed(selected),
				origin: selection.range.start,
			};
		}
		if (retainedQuery) {
			return { searchString: retainedQuery, origin: selection.active };
		}
		const text = this._editorModel.sourceText.get().value;
		const word = findWordAt(text, selection.active, this._editorModel.wordNavigationConfig.get());
		const value = text.slice(word.start, word.end);
		return {
			searchString: /\S/u.test(value) ? this._prepareSeed(value) : '',
			origin: word.start,
		};
	}

	private _prepareSeed(value: string): string {
		return this.model.isRegex.get() ? escapeFindRegex(value) : value;
	}

	private _selectedSingleLineText(selection: Selection): string | undefined {
		if (selection.isCollapsed) { return undefined; }
		const value = selection.range.substring(this._editorModel.sourceText.get().value);
		return value.includes('\n') || value.length === 0 ? undefined : value;
	}

	private _toggleFindInSelection(): void {
		if (this.model.searchScope.get()) {
			this.model.setSearchScope(undefined);
			return;
		}
		const selection = this._selectionForScope.get();
		if (!selection || selection.isCollapsed) { return; }
		this.model.setSearchOrigin(selection.range.start);
		this.model.setSearchScope(selection.range);
	}
}

function isFindChord(event: KeyboardEvent, platform: KeyboardPlatform): boolean {
	return event.key.toLowerCase() === 'f'
		&& !event.shiftKey
		&& !event.altKey
		&& (platform === 'macos'
			? event.metaKey && !event.ctrlKey
			: event.ctrlKey && !event.metaKey);
}

function consume(event: KeyboardEvent): void {
	event.preventDefault();
	event.stopPropagation();
}

function sameBlockSet<T>(a: ReadonlySet<T>, b: ReadonlySet<T>): boolean {
	return a.size === b.size && Array.from(a).every(value => b.has(value));
}

function isFullyRendered(documentView: DocumentViewNode, range: OffsetRange): boolean {
	const mapped = mappedRangesForOffsets(documentView, [range]);
	if (range.isEmpty) {
		return mapped.some(entry => isDomRangeVisible(entry.range));
	}
	const visibleLength = mapped.reduce((total, entry) => {
		const hasVisibleRect = Array.from(entry.range.getClientRects())
			.some(rect => rect.width > 0 && rect.height > 0)
			&& isDomRangeVisible(entry.range);
		return total + (hasVisibleRect ? entry.sourceRange.length : 0);
	}, 0);
	return visibleLength === range.length;
}

function isDomRangeVisible(range: Range): boolean {
	const doc = range.startContainer.ownerDocument;
	if (!doc) { return false; }
	const win = doc.defaultView ?? window;
	for (
		let element = range.startContainer instanceof Element
			? range.startContainer
			: range.startContainer.parentElement;
		element;
		element = element.parentElement
	) {
		const style = win.getComputedStyle(element);
		if (style.display === 'none' || style.visibility === 'hidden' || style.visibility === 'collapse') {
			return false;
		}
	}
	return true;
}
