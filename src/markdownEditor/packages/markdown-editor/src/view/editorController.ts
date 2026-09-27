import { Disposable, transaction } from '@vscode/observables';
import { OffsetRange } from '../core/offsetRange.js';
import { Point2D } from '../core/geometry.js';
import { StringEdit } from '../core/stringEdit.js';
import { Selection } from '../core/selection.js';
import { CursorPosition, type CursorPosition as CursorPositionType } from '../core/cursorPosition.js';
import { findBlockAtOffset, type EditorModel } from '../model/editorModel.js';
import type { EditorCommandDefinition } from '../editorCommands.js';
import { FindController } from '../contrib/find/findController.js';
import type { BlockAstNode, DocumentAstNode } from '../parser/ast.js';
import {
    cursorRight, cursorLeft, cursorMoveRight, cursorMoveLeft,
    cursorWordRight, cursorWordLeft, cursorLineStart, cursorLineEnd,
    cursorDocumentStart, cursorDocumentEnd, cursorVisualLineStart, cursorVisualLineEnd,
    cursorUp, cursorDown,
} from '../commands/cursorCommands.js';
import {
    deleteLeft, deleteRight, deleteWordLeft, deleteWordRight, deleteLineLeft, deleteLineRight,
    DEFAULT_INDENTATION_CONFIG, insertText, insertTab, outdent, insertParagraph, insertHardLineBreak, insertSmartEnter,
    outdentWhitespace, pendingParagraphAfterCompletedBlock, tabTextForLinePrefix,
    type IndentationConfig,
} from '../commands/editCommands.js';
import {
    copyLinesDown, copyLinesUp, deleteLines, joinLines, moveLinesDown, moveLinesUp,
} from '../commands/lineEditCommands.js';
import { selectAll, selectWord, selectBlock } from '../commands/selectionCommands.js';
import type { CursorCommand, EditCommand, VisualCursorCommand, CursorCommandContext, VisualCursorCommandContext } from '../commands/types.js';
import type { EditorView } from './editorView.js';
import { NativeClipboardStrategy, type IClipboardStrategy } from './clipboardStrategy.js';
import type { IHistoryStrategy } from './historyStrategy.js';
import {
    detectKeyboardPlatform,
    isCaretMotionKey,
    resolveEditorKeyboardAction,
    toEditorKeyboardEvent,
    type EditorKeyboardAction,
    type KeyboardPlatform,
    type KeyboardProfile,
    vscodeKeyboardProfile,
} from './keyboardNavigation.js';

/** Options for an {@link EditorController}. */
export interface EditorControllerOptions {
    /**
     * How copy/cut/paste is handled. Defaults to {@link NativeClipboardStrategy},
     * which reads the browser's native clipboard events — pass a different
     * strategy (e.g. `AsyncClipboardStrategy`) in hosts that swallow them.
     */
    readonly clipboardStrategy?: IClipboardStrategy;
    /**
     * Where undo and redo are executed: `LocalHistoryStrategy` for a
     * self-contained editor, or a strategy that forwards to the host's own
     * document history. Left unset, the chords are passed on to the host.
     */
    readonly historyStrategy?: IHistoryStrategy;
    readonly keyboardPlatform?: KeyboardPlatform;
    readonly keyboardProfile?: KeyboardProfile;
    /**
     * Bindings owned by the host. Matching events have their browser default
     * suppressed but continue propagating so the host keybinding service sees them.
     */
    readonly forwardedKeyboardProfile?: KeyboardProfile;
    /** Tab-stop settings used outside semantic list indentation. */
    readonly indentation?: IndentationConfig;
    readonly find?: false;
}

/** Max time between pointer-downs to count as part of the same multi-click. */
const MULTI_CLICK_TIME_MS = 500;
/** Max movement (px, per axis) between pointer-downs of one multi-click. */
const MULTI_CLICK_DISTANCE_PX = 5;

/**
 * Translates raw browser input (mouse, keyboard, EditContext) into model
 * mutations. Knows about DOM event types but never reads/writes the DOM
 * directly — it asks the {@link EditorView} to broker DOM↔source-offset
 * conversions so the model stays free of view types.
 *
 * Owns the only non-derivable controller state:
 * - `_desiredColumn` — sticky column for up/down navigation
 * - `_clickCount` / `_lastPointerDown` — multi-click detection for pointer
 *   input, since `pointerdown` events (unlike `mousedown`) don't populate
 *   `detail` with a click count.
 */
export class EditorController extends Disposable {
    readonly findController: FindController | undefined;
    private _desiredColumn: number | undefined;
    private readonly _keyboardPlatform: KeyboardPlatform;
    private readonly _keyboardProfile: KeyboardProfile;
    private readonly _forwardedKeyboardProfile: KeyboardProfile | undefined;
    private readonly _historyStrategy: IHistoryStrategy | undefined;
    private readonly _indentation: IndentationConfig;
    private readonly _tabFocusStatus: HTMLElement | undefined;
    private _tabMovesFocus = false;
    /** Indentation copied by the most recent fenced-code Enter, while still untouched. */
    private _generatedIndentation: OffsetRange | undefined;

    /** Running click count for the current multi-click sequence (1, 2, 3, …). */
    private _clickCount = 0;
    /** Timestamp and position of the previous pointer-down, for multi-click detection. */
    private _lastPointerDown: { time: number; point: Point2D } | undefined;

    constructor(
        private readonly _model: EditorModel,
        private readonly _view: EditorView,
        options?: EditorControllerOptions,
    ) {
        super();
        const el = this._view.element;
        const win = el.ownerDocument.defaultView ?? window;
        this._keyboardPlatform = options?.keyboardPlatform ?? detectKeyboardPlatform(win.navigator.userAgent);
        this._keyboardProfile = options?.keyboardProfile ?? vscodeKeyboardProfile;
        this._forwardedKeyboardProfile = options?.forwardedKeyboardProfile;
        this._historyStrategy = options?.historyStrategy;
        this._indentation = options?.indentation ?? DEFAULT_INDENTATION_CONFIG;
        this._tabFocusStatus = this._keyboardProfile === vscodeKeyboardProfile
            ? this._registerTabFocusAccessibility(el)
            : undefined;
        el.addEventListener('pointerdown', this._handlePointerDown);
        el.addEventListener('keydown', this._handleKeyDown);
        this._register({
            dispose: () => {
                el.removeEventListener('pointerdown', this._handlePointerDown);
                el.removeEventListener('keydown', this._handleKeyDown);
            },
        });

        // Track the live Ctrl/Cmd state on the model. Listen on the window (not
        // just the editor element) so a release or focus loss while the pointer
        // is elsewhere still clears it, avoiding a stuck modifier.
        win.addEventListener('keydown', this._updateModifierState);
        win.addEventListener('keyup', this._updateModifierState);
        win.addEventListener('blur', this._clearModifierState);
        el.ownerDocument.addEventListener('selectionchange', this._discardNativeSelection);
        this._register({
            dispose: () => {
                win.removeEventListener('keydown', this._updateModifierState);
                win.removeEventListener('keyup', this._updateModifierState);
                win.removeEventListener('blur', this._clearModifierState);
                el.ownerDocument.removeEventListener('selectionchange', this._discardNativeSelection);
            },
        });

        const clipboardStrategy = options?.clipboardStrategy ?? new NativeClipboardStrategy();
        this._register(clipboardStrategy.connect({
            element: el,
            getSelectedText: () => this._selectedText(),
            deleteSelection: () => {
                this._generatedIndentation = undefined;
                this._executeEditCommand(deleteLeft);
            },
            insertText: text => {
                if (!this._handlePendingInput(text)) {
                    this._insertText(text);
                }
            },
        }));

        const editContext = this._view.editContext;
        editContext.addEventListener('textupdate', this._handleTextUpdate);
        this._register({
            dispose: () => editContext.removeEventListener('textupdate', this._handleTextUpdate as EventListener),
        });

        this.findController = options?.find === false
            ? undefined
            : this._register(new FindController(this._model, this._view, {
                keyboardPlatform: this._keyboardPlatform,
            }));
    }

    private readonly _handleTextUpdate = (e: TextUpdateEvent): void => {
        if (this._model.readonlyMode.get()) {
            if (e.text.length > 0) {
                this._view.showReadonlyEditingAttempt();
            }
            return;
        }
        // Horizontal whitespace remains transient because Markdown has no
        // whitespace-only paragraph. Content-producing input materializes the
        // buffered indentation and new text together.
        if (this._model.pendingParagraph.get() !== undefined) {
            this._generatedIndentation = undefined;
            if (e.text.length > 0) {
                this._handlePendingInput(e.text);
            } else {
                this._model.cancelPendingParagraph();
            }
            return;
        }
        this._insertText(e.text, new Selection(e.updateRangeStart, e.updateRangeEnd));
    };

    private _insertText(text: string, selectionOverride?: Selection): void {
        const generatedIndentation = this._generatedIndentation;
        this._executeEditCommand(insertText(text, generatedIndentation), selectionOverride);
        this._generatedIndentation = this._remainingGeneratedIndentation(generatedIndentation, text);
    }

    private _remainingGeneratedIndentation(
        generatedIndentation: OffsetRange | undefined,
        insertedText: string,
    ): OffsetRange | undefined {
        if (!generatedIndentation || insertedText.length === 0) { return undefined; }
        const source = this._model.sourceText.get().value;
        const selection = this._model.selection.get();
        if (!selection?.isCollapsed || generatedIndentation.endExclusive > selection.active) { return undefined; }
        const lineStart = source.lastIndexOf('\n', selection.active - 1) + 1;
        if (
            generatedIndentation.start !== lineStart
            || !/^[ \t]+$/.test(generatedIndentation.substring(source))
        ) {
            return undefined;
        }
        const fencePrefix = source.slice(generatedIndentation.endExclusive, selection.active);
        return /^`{1,2}$|^~{1,2}$/.test(fencePrefix) ? generatedIndentation : undefined;
    }

    /** Handle typed, pasted, or command-generated text while a paragraph is pending. */
    private _handlePendingInput(text: string): boolean {
        const pending = this._model.pendingParagraph.get();
        if (!pending) { return false; }
        if (text.length === 0) {
            return true;
        } else if (/^[ \t]+$/.test(text)) {
            this._model.setPendingParagraphText(pending.text + text);
        } else {
            this._runUndoableEdit(() => this._model.materializePendingParagraph(text));
        }
        return true;
    }

    private _deletePendingText(command: 'deleteLeft' | 'deleteWordLeft' | 'deleteLineLeft'): void {
        const pending = this._model.pendingParagraph.get();
        if (!pending) { return; }
        if (pending.text.length === 0) {
            this._model.cancelPendingParagraph();
            return;
        }
        this._model.setPendingParagraphText(command === 'deleteLeft'
            ? pending.text.slice(0, -1)
            : '');
    }

    private readonly _handlePointerDown = (e: PointerEvent): void => {
        this._generatedIndentation = undefined;
        // Only the primary button starts a selection drag.
        if (e.button !== 0) { return; }
        e.preventDefault();
        this._view.stopFollowingCaret();
        this._model.cancelPendingParagraph();
        this._view.focus();
        this._desiredColumn = undefined;

        const point = new Point2D(e.clientX, e.clientY);

        // `pointerdown` doesn't carry a click count in `detail` (it's always 0),
        // so detect double/triple clicks ourselves: consecutive pointer-downs
        // close in time and position bump the count, otherwise it resets to 1.
        const prev = this._lastPointerDown;
        const isRepeat = prev !== undefined
            && (e.timeStamp - prev.time) < MULTI_CLICK_TIME_MS
            && Math.abs(point.x - prev.point.x) < MULTI_CLICK_DISTANCE_PX
            && Math.abs(point.y - prev.point.y) < MULTI_CLICK_DISTANCE_PX;
        this._clickCount = isRepeat ? this._clickCount + 1 : 1;
        this._lastPointerDown = { time: e.timeStamp, point };

        // A click on the editor padding (outside the rendered document content)
        // clears the selection entirely.
        if (!this._view.isPointInContent(point)) {
            this._setUserSelection(undefined);
            return;
        }

        const hit = this._view.resolveCursorHit(point);
        const offset = hit?.offset ?? this._model.sourceText.get().value.length;
        const glyphAffinity = hit?.affinity === 'upstream' ? { offset } : undefined;

        if (this._clickCount === 2) {
            const ctx = this._makeCursorContext();
            this._setUserSelection(selectWord(ctx, offset));
            return;
        }

        if (this._clickCount === 3) {
            const blockRange = findBlockRangeAt(this._model.document.get(), offset);
            if (blockRange) {
                this._setUserSelection(selectBlock(this._makeCursorContext(), blockRange));
            }
            return;
        }

        // A primary single click (no Shift) inside locked content hints the user
        // expects to edit, so we flash the mode toggle to reveal the lock — but
        // only once the gesture ends *without* a selection. Deferring the check to
        // pointer-up and keying it off an empty final selection is what tells a
        // click apart from a drag-select (which stays quiet) and tolerates
        // sub-character pointer jitter. A Shift-click extends a selection, so it
        // is excluded here. Padding clicks and the 2nd/3rd press of a
        // double/triple click return earlier, so word/block selection is
        // preserved — but note the *first* press of a multi-click is itself a
        // single click, so it still emits one (bounded, non-stacking) sheen
        // before the word/block is selected. That is an accepted trade:
        // suppressing it would need a 500ms debounce that lags every single-click
        // reveal, or a jarring mid-animation cancel.
        const revealsLockOnClick = this._clickCount === 1
            && !e.shiftKey
            && this._model.readonlyMode.get();

        if (e.shiftKey) {
            const sel = this._model.selection.get() ?? Selection.collapsed(offset);
            this._setUserSelection(sel.withActive(offset));
        } else {
            this._setUserSelection(Selection.collapsed(offset), glyphAffinity);
        }

        // Capture the pointer so the drag keeps receiving move/up events even
        // when the pointer leaves the window — a plain `mouseup` fired outside
        // the window never reaches the page, which would otherwise leave the
        // drag "stuck" until the next click. Pointer capture also unifies
        // mouse, touch, and pen input.
        const el = this._view.element;
        const pointerId = e.pointerId;
        el.setPointerCapture(pointerId);
        this._model.isSelecting.set(true, undefined);

        const onPointerMove = (me: PointerEvent): void => {
            const sel = this._model.selection.get() ?? Selection.collapsed(offset);
            const moveOffset = this._view.resolveOffsetFromPoint(new Point2D(me.clientX, me.clientY))
                ?? sel.active;
            this._setUserSelection(new Selection(sel.anchor, moveOffset));
        };
        const onPointerUp = (): void => {
            this._model.isSelecting.set(false, undefined);
            // A click that placed a caret (collapsed selection) rather than a
            // drag-selection reveals the lock; reuses the same sheen as typing.
            if (revealsLockOnClick && (this._model.selection.get()?.isCollapsed ?? true)) {
                this._view.showReadonlyEditingAttempt();
            }
            el.removeEventListener('pointermove', onPointerMove);
            el.removeEventListener('pointerup', onPointerUp);
            el.removeEventListener('pointercancel', onPointerUp);
            el.removeEventListener('lostpointercapture', onPointerUp);
        };
        el.addEventListener('pointermove', onPointerMove);
        el.addEventListener('pointerup', onPointerUp);
        el.addEventListener('pointercancel', onPointerUp);
        el.addEventListener('lostpointercapture', onPointerUp);
    };

    private _makeCursorContext(selectionOverride?: Selection): CursorCommandContext {
        const document = this._model.document.get();
        const selection = selectionOverride ?? this._model.selection.get() ?? Selection.collapsed(0);
        const activeBlock = selectionOverride
            ? findBlockAtOffset(document, selection.active)
            : this._model.activeBlock.get();
        return {
            text: this._model.sourceText.get().value,
            selection,
            document,
            activeBlock,
            markerVisibleBlocks: this._model.markerVisibleBlocks.get(),
            wordNavigationConfig: this._model.wordNavigationConfig.get(),
            cursorPosition: selectionOverride
                ? CursorPosition.source(selection.active)
                : this._model.cursorPosition.get() ?? CursorPosition.source(selection.active),
        };
    }

    private _makeVisualCursorContext(): VisualCursorCommandContext {
        return {
            ...this._makeCursorContext(),
            desiredColumn: this._desiredColumn,
            lineMap: this._view.measuredLayout.visualLineMap.get(),
        };
    }

    private _executeCursorCommand(command: CursorCommand, extend: boolean, direction?: 'left' | 'right'): void {
        const ctx = this._makeCursorContext();
        const position = command(ctx);
        const glyphAffinity = !extend && direction === 'right' && position.kind === 'source'
            && this._view.measuredLayout.visualLineMap.get().endsAtWideNewlineGlyph(position.offset)
            ? { offset: position.offset }
            : undefined;
        this._applyCursorPosition(ctx.selection, position, extend, glyphAffinity);
        this._desiredColumn = undefined;
    }

    private _executeEditCommand(command: EditCommand, selectionOverride?: Selection): void {
        if (this._model.readonlyMode.get()) {
            this._view.showReadonlyEditingAttempt();
            return;
        }
        const ctx = this._makeCursorContext(selectionOverride);
        const result = command(ctx);
        if (!result) { return; }
        this._runUndoableEdit(() => this._model.applyEdit(result.edit, result.selection), result.edit);
        this._desiredColumn = undefined;
    }

    private _runUndoableEdit(operation: () => void, edit?: StringEdit): void {
        const historyStrategy = this._historyStrategy;
        if (historyStrategy?.record) {
            historyStrategy.record(operation, edit);
        } else {
            operation();
        }
        this._view.revealCaretAfterEdit();
    }

    private _executeVisualCursorCommand(command: VisualCursorCommand, extend: boolean): void {
        const ctx = this._makeVisualCursorContext();
        const result = command(ctx);
        this._applyCursorPosition(ctx.selection, result.position, extend);
        this._desiredColumn = result.desiredColumn;
    }

    private _cursorDown(extend: boolean): void {
        const ctx = this._makeVisualCursorContext();
        const result = cursorDown(ctx);
        if (
            !extend
            && !this._model.readonlyMode.get()
            && !ctx.lineMap.isEmpty
            && ctx.cursorPosition.kind === 'source'
            && result.position.kind === 'source'
            && result.position.offset === ctx.selection.active
        ) {
            const pending = pendingParagraphAfterCompletedBlock(ctx);
            if (pending) {
                this._model.armPendingParagraph(pending);
                this._view.revealCaretAfterKeyboardNavigation();
                this._desiredColumn = undefined;
                return;
            }
        }
        this._applyCursorPosition(ctx.selection, result.position, extend);
        this._desiredColumn = result.desiredColumn;
    }

    private _setUserSelection(
        selection: Selection | undefined,
        glyphAffinity?: { readonly offset: number },
    ): void {
        transaction(tx => {
            this._model.pendingParagraph.set(undefined, tx);
            this._model.selectionSource.set('user', tx);
            this._model.selection.set(selection, tx);
            this._model.cursorAffinity.set(glyphAffinity, tx);
        });
    }

    /**
     * Arrow Right from the left of a `↵` lands on its right edge (`upstream`).
     * Another Right moves to the next line. Arrow Left from that next line
     * returns to the glyph's right edge before stepping onto the glyph itself.
     */
    private _nudgeWideNewlineGlyph(direction: 'left' | 'right'): boolean {
        const selection = this._model.selection.get();
        if (!selection?.isCollapsed) { return false; }
        const offset = selection.active;
        const map = this._view.measuredLayout.visualLineMap.get();
        if (!map.endsAtWideNewlineGlyph(offset)) { return false; }
        const atGlyphEnd = this._model.cursorAffinity.get()?.offset === offset;
        if (direction === 'right' && atGlyphEnd) {
            this._model.cursorAffinity.set(undefined, undefined);
            this._view.revealCaretAfterKeyboardNavigation();
            return true;
        }
        if (direction === 'left' && !atGlyphEnd) {
            this._model.cursorAffinity.set({ offset }, undefined);
            this._view.revealCaretAfterKeyboardNavigation();
            return true;
        }
        return false;
    }

    private _applyCursorPosition(
        selection: Selection,
        position: CursorPositionType,
        extend: boolean,
        glyphAffinity?: { readonly offset: number },
    ): void {
        if (position.kind === 'virtual') {
            const pending = this._model.pendingParagraph.get();
            if (pending?.cursorLine !== position.line) {
                const offset = position.line.sourceOffsetBefore;
                this._setUserSelection(extend ? selection.withActive(offset) : Selection.collapsed(offset));
                this._view.revealCaretAfterKeyboardNavigation();
            }
            return;
        }
        this._setUserSelection(
            extend ? selection.withActive(position.offset) : Selection.collapsed(position.offset),
            extend ? undefined : glyphAffinity,
        );
        this._view.revealCaretAfterKeyboardNavigation();
    }

    /** Move the cursor down one visual line (Arrow Down). */
    cursorDown(extend = false): void {
        this._cursorDown(extend);
    }

    /** Move the cursor up one visual line (Arrow Up). */
    cursorUp(extend = false): void {
        this._executeVisualCursorCommand(cursorUp, extend);
    }

    private _selectedText(): string | undefined {
        const sel = this._model.selection.get();
        if (!sel || sel.isCollapsed) { return undefined; }
        return this._model.sourceText.get().value.slice(sel.range.start, sel.range.endExclusive);
    }

    private readonly _updateModifierState = (e: KeyboardEvent): void => {
        this._model.ctrlOrMetaDown.set(e.ctrlKey || e.metaKey, undefined);
    };

    private readonly _clearModifierState = (): void => {
        this._model.ctrlOrMetaDown.set(false, undefined);
    };

    /**
     * Drop any native DOM selection over the rendered text.
     *
     * The editor paints selection from `model.selection`, so a browser
     * selection there is always spurious: nothing reads it (copy/cut read the
     * model, hit-testing uses the measured layout) and nothing clears it, so it
     * lingers as a second highlight even after the caret moves away.
     * {@link isCaretMotionKey} stops the common source synchronously; this is
     * the backstop for the rest of the browser's editing commands, which are
     * platform- and version-specific and cannot be enumerated (Shift+PageDown
     * and macOS Shift+Ctrl+B both reach one today).
     *
     * Scoped twice so it only ever discards selections the editor owns: the
     * range must touch the rendered text (overlays such as comment widgets sit
     * beside it and stay selectable), and input focus must still be inside this
     * editor (so a host find-in-page, which selects while its own input is
     * focused, is left alone).
     */
    private readonly _discardNativeSelection = (): void => {
        const doc = this._view.element.ownerDocument;
        if (!this._view.element.contains(doc.activeElement)) { return; }
        const selection = doc.getSelection();
        if (!selection || selection.rangeCount === 0 || selection.isCollapsed) { return; }
        for (let i = 0; i < selection.rangeCount; i++) {
            if (this._view.intersectsRenderedContent(selection.getRangeAt(i))) {
                selection.removeAllRanges();
                return;
            }
        }
    };

    private readonly _handleKeyDown = (e: KeyboardEvent): void => {
        if (e.isComposing) { return; }
        if (isNestedInteractiveEvent(e, this._view.element)) { return; }
        this._updateModifierState(e);
        if (e.key === 'Tab' && (this._model.readonlyMode.get() || this._tabMovesFocus)) {
            return;
        }

        // A pending empty paragraph is transient. Escape abandons it here; a
        // printable character must instead be left for the `textupdate` handler
        // to retain or materialize (cancelling here would make it land in the old
        // paragraph),
        // and a bare Enter falls through to `_smartEnter` (re-arm / push down).
        if (this._model.pendingParagraph.get() !== undefined) {
            if (e.key === 'Escape') {
                consumeKeyboardEvent(e);
                this._model.cancelPendingParagraph();
                return;
            }
        }

        const action = resolveEditorKeyboardAction(
            toEditorKeyboardEvent(e),
            this._keyboardPlatform,
            this._keyboardProfile,
        );
        if (!action) {
            const forwardedAction = this._forwardedKeyboardProfile
                ? resolveEditorKeyboardAction(
                    toEditorKeyboardEvent(e),
                    this._keyboardPlatform,
                    this._forwardedKeyboardProfile,
                )
                : undefined;
            if (forwardedAction) {
                e.preventDefault();
                return;
            }
            // The chord has no editor binding, so the host keeps it. Suppress
            // only the browser's default caret motion — see `isCaretMotionKey`.
            // The event still propagates, so a host binding can run.
            if (isCaretMotionKey(e.key)) { e.preventDefault(); }
            return;
        }

        const hasPendingParagraph = this._model.pendingParagraph.get() !== undefined;
        if (action.kind === 'history' && !hasPendingParagraph && !this._historyStrategy) {
            return;
        }
        consumeKeyboardEvent(e);
        this._executeKeyboardAction(action);
    };

    executeCommand(command: EditorCommandDefinition): void {
        this._executeKeyboardAction(command.action);
    }

    private _executeKeyboardAction(action: EditorKeyboardAction): void {
        this._generatedIndentation = undefined;
        switch (action.kind) {
            case 'cursor': {
                const command = action.command;
                switch (command) {
                    case 'left':
                    case 'right': {
                        const direction = command === 'left' ? 'left' : 'right';
                        if (!action.extend && this._nudgeWideNewlineGlyph(direction)) { return; }
                        this._executeCursorCommand(
                            action.extend
                                ? (direction === 'left' ? cursorMoveLeft : cursorMoveRight)
                                : (direction === 'left' ? cursorLeft : cursorRight),
                            action.extend,
                            direction,
                        );
                        return;
                    }
                    case 'up': this._executeVisualCursorCommand(cursorUp, action.extend); return;
                    case 'down': this._cursorDown(action.extend); return;
                    case 'wordLeft': this._executeCursorCommand(cursorWordLeft, action.extend); return;
                    case 'wordRight': this._executeCursorCommand(cursorWordRight, action.extend); return;
                    case 'visualLineStart': this._executeVisualCursorCommand(cursorVisualLineStart, action.extend); return;
                    case 'visualLineEnd': this._executeVisualCursorCommand(cursorVisualLineEnd, action.extend); return;
                    case 'logicalLineStart': this._executeCursorCommand(cursorLineStart, action.extend); return;
                    case 'logicalLineEnd': this._executeCursorCommand(cursorLineEnd, action.extend); return;
                    case 'documentStart': this._executeCursorCommand(cursorDocumentStart, action.extend); return;
                    case 'documentEnd': this._executeCursorCommand(cursorDocumentEnd, action.extend); return;
                    default: return assertNever(command);
                }
            }
            case 'edit': {
                const command = action.command;
                if (this._model.pendingParagraph.get() !== undefined) {
                    if (
                        command === 'deleteLeft'
                        || command === 'deleteWordLeft'
                        || command === 'deleteLineLeft'
                    ) {
                        this._deletePendingText(command);
                        return;
                    }
                    this._model.cancelPendingParagraph();
                    return;
                }
                switch (command) {
                    case 'deleteLeft': this._executeEditCommand(deleteLeft); return;
                    case 'deleteRight': this._executeEditCommand(deleteRight); return;
                    case 'deleteWordLeft': this._executeEditCommand(deleteWordLeft); return;
                    case 'deleteWordRight': this._executeEditCommand(deleteWordRight); return;
                    case 'deleteLineLeft': this._executeEditCommand(deleteLineLeft); return;
                    case 'deleteLineRight': this._executeEditCommand(deleteLineRight); return;
                    case 'copyLinesUp': this._executeEditCommand(copyLinesUp); return;
                    case 'copyLinesDown': this._executeEditCommand(copyLinesDown); return;
                    case 'moveLinesUp': this._executeEditCommand(moveLinesUp); return;
                    case 'moveLinesDown': this._executeEditCommand(moveLinesDown); return;
                    case 'deleteLines': this._executeEditCommand(deleteLines); return;
                    case 'joinLines': this._executeEditCommand(joinLines); return;
                    default: return assertNever(command);
                }
            }
            case 'selectAll': {
                const ctx = this._makeCursorContext();
                this._setUserSelection(selectAll(ctx, 0));
                return;
            }
            case 'history': {
                if (this._model.pendingParagraph.get() !== undefined) {
                    if (action.command === 'undo') {
                        this._model.cancelPendingParagraph();
                    }
                    return;
                }
                if (this._model.readonlyMode.get()) {
                    return;
                }
                const historyStrategy = this._historyStrategy;
                if (!historyStrategy) {
                    return;
                }
                const command = action.command;
                switch (command) {
                    case 'undo': historyStrategy.undo(); return;
                    case 'redo': historyStrategy.redo(); return;
                    default: return assertNever(command);
                }
            }
            case 'tab': {
                const pending = this._model.pendingParagraph.get();
                if (pending !== undefined) {
                    if (action.command === 'insert') {
                        this._model.setPendingParagraphText(
                            pending.text + tabTextForLinePrefix(pending.text, this._indentation),
                        );
                    } else {
                        this._model.setPendingParagraphText(
                            outdentWhitespace(pending.text, this._indentation),
                        );
                    }
                    return;
                }
                const command = action.command;
                switch (command) {
                    case 'insert': this._executeEditCommand(insertTab(this._indentation)); return;
                    case 'outdent': this._executeEditCommand(outdent(this._indentation)); return;
                    default: return assertNever(command);
                }
            }
            case 'toggleTabFocus': {
                this._model.cancelPendingParagraph();
                if (this._model.readonlyMode.get()) {
                    if (this._tabFocusStatus) {
                        this._tabFocusStatus.textContent = 'Tab always moves focus while the document is locked.';
                    }
                    return;
                }
                this._tabMovesFocus = !this._tabMovesFocus;
                if (this._tabFocusStatus) {
                    this._tabFocusStatus.textContent = this._tabMovesFocus
                        ? 'Tab now moves focus. Press Control+M to make Tab insert indentation.'
                        : 'Tab now inserts indentation. Press Control+M to make Tab move focus.';
                }
                return;
            }
            case 'toggleReadonly': {
                this._model.toggleReadonlyMode();
                return;
            }
            case 'enter': {
                // Every Enter variant is source-based, while a pending caret is
                // virtual and only parks its selection at an adjacent source
                // offset. Preserve the pending line rather than editing the
                // preceding block from that surrogate offset.
                if (this._model.pendingParagraph.get() !== undefined) {
                    if (this._model.readonlyMode.get()) {
                        this._view.showReadonlyEditingAttempt();
                    }
                    this._desiredColumn = undefined;
                    return;
                }
                const command = action.command;
                switch (command) {
                    case 'smartEnter': this._smartEnter(); return;
                    case 'insertParagraph': this._executeEditCommand(insertParagraph); return;
                    case 'insertHardLineBreak': this._executeEditCommand(insertHardLineBreak); return;
                    default: return assertNever(command);
                }
            }
            default:
                return assertNever(action);
        }
    }

    /**
     * Context-aware Enter: splits / line-breaks via {@link insertSmartEnter}, or
     * arms a transient empty paragraph when at the end of a paragraph.
     */
    private _smartEnter(): void {
        if (this._model.readonlyMode.get()) {
            this._view.showReadonlyEditingAttempt();
            return;
        }
        const ctx = this._makeCursorContext();
        const result = insertSmartEnter(ctx);
        if (result.kind === 'edit') {
            this._runUndoableEdit(() => this._model.applyEdit(result.edit, result.selection), result.edit);
            this._generatedIndentation = result.generatedIndentation;
        } else {
            this._model.armPendingParagraph({
                anchorBlock: result.anchorBlock,
                replaceRange: result.replaceRange,
                separateFromPreviousBlock: result.separateFromPreviousBlock,
                atEof: result.atEof,
            });
            this._view.revealCaretAfterEdit();
        }
        this._desiredColumn = undefined;
    }

    private _registerTabFocusAccessibility(element: HTMLElement): HTMLElement {
        const previousDescription = element.getAttribute('aria-description');
        const previousShortcuts = element.getAttribute('aria-keyshortcuts');
        element.setAttribute('aria-description', 'Press Control+M to toggle whether Tab inserts indentation or moves focus. While locked, Tab always moves focus.');
        element.setAttribute('aria-keyshortcuts', 'Control+M');

        const status = element.ownerDocument.createElement('span');
        status.className = 'md-editor-a11y-status';
        status.setAttribute('aria-live', 'polite');
        element.ownerDocument.body.appendChild(status);
        this._register({
            dispose: () => {
                status.remove();
                restoreAttribute(element, 'aria-description', previousDescription);
                restoreAttribute(element, 'aria-keyshortcuts', previousShortcuts);
            },
        });
        return status;
    }
}

function assertNever(value: never): never {
    throw new Error(`Unhandled keyboard action: ${JSON.stringify(value)}`);
}

function consumeKeyboardEvent(event: KeyboardEvent): void {
    event.preventDefault();
    event.stopPropagation();
}

function isNestedInteractiveEvent(event: KeyboardEvent, editorRoot: HTMLElement): boolean {
    return event.target !== editorRoot;
}

function findBlockRangeAt(doc: DocumentAstNode, offset: number): OffsetRange | undefined {
    const blocks = new Set(doc.blocks);
    let pos = 0;
    for (const child of doc.children) {
        if (blocks.has(child as BlockAstNode)) {
            const range = OffsetRange.ofStartAndLength(pos, child.length);
            if (range.contains(offset) || range.endExclusive === offset) {
                return range;
            }
        }
        pos += child.length;
    }
    return undefined;
}

function restoreAttribute(element: HTMLElement, name: string, value: string | null): void {
    if (value === null) {
        element.removeAttribute(name);
    } else {
        element.setAttribute(name, value);
    }
}
