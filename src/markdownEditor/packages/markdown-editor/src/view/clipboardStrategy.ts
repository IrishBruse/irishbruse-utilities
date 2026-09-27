import type { IDisposable } from '@vscode/observables';

/**
 * The editor operations a clipboard strategy drives. The strategy never
 * touches the model or the DOM directly — it asks through this seam, so the
 * same strategy works regardless of how the editor is wired up.
 */
export interface IClipboardContext {
    /** The element that owns focus and receives clipboard/keyboard events. */
    readonly element: HTMLElement;
    /** The selected source text, or `undefined` when the selection is empty. */
    getSelectedText(): string | undefined;
    /** Delete the current selection (the cut half of cut). */
    deleteSelection(): void;
    /** Insert text at the caret, replacing any selection (the paste action). */
    insertText(text: string): void;
}

/**
 * How copy/cut/paste intent reaches the editor. Host environments deliver it
 * differently, so the controller owns no clipboard logic itself — it
 * {@link connect}s a strategy and lets it install whatever listeners it needs.
 *
 * Two implementations ship:
 * - {@link NativeClipboardStrategy} (default) reads the browser's native
 *   `copy`/`cut`/`paste` events and their synchronous `clipboardData`.
 * - {@link AsyncClipboardStrategy} drives the async `navigator.clipboard` API
 *   from Ctrl/Cmd+C/X/V keystrokes, for hosts (e.g. VS Code webviews) that
 *   swallow the native clipboard events before they reach the editor.
 */
export interface IClipboardStrategy {
    /**
     * Wire up clipboard handling against `context`. The returned disposable
     * tears down every listener the strategy installed.
     */
    connect(context: IClipboardContext): IDisposable;
}

/**
 * Default strategy: handle the browser's native `copy`/`cut`/`paste` events,
 * reading and writing the synchronous {@link ClipboardEvent.clipboardData}.
 * This is the standard rich-editor approach and works wherever the browser
 * actually dispatches those events to the focused element (e.g. a standalone
 * web page).
 */
export class NativeClipboardStrategy implements IClipboardStrategy {
    connect(context: IClipboardContext): IDisposable {
        const onCopy = (e: ClipboardEvent): void => {
            if (findNestedEditableClipboardTarget(e.target, context.element) || isNestedMediaClipboardTarget(e.target, context.element)) { return; }
            const text = context.getSelectedText();
            if (text === undefined) { return; }
            e.preventDefault();
            e.clipboardData?.setData('text/plain', text);
        };
        const onCut = (e: ClipboardEvent): void => {
            if (findNestedEditableClipboardTarget(e.target, context.element) || isNestedMediaClipboardTarget(e.target, context.element)) { return; }
            const text = context.getSelectedText();
            if (text === undefined) { return; }
            e.preventDefault();
            e.clipboardData?.setData('text/plain', text);
            context.deleteSelection();
        };
        const onPaste = (e: ClipboardEvent): void => {
            if (findNestedEditableClipboardTarget(e.target, context.element) || isNestedMediaClipboardTarget(e.target, context.element)) { return; }
            e.preventDefault();
            const text = e.clipboardData?.getData('text/plain');
            if (!text) { return; }
            context.insertText(text);
        };

        const el = context.element;
        el.addEventListener('copy', onCopy);
        el.addEventListener('cut', onCut);
        el.addEventListener('paste', onPaste);
        return {
            dispose: () => {
                el.removeEventListener('copy', onCopy);
                el.removeEventListener('cut', onCut);
                el.removeEventListener('paste', onPaste);
            },
        };
    }
}

/**
 * Strategy for hosts that intercept native clipboard shortcuts, notably
 * VS Code webviews. Their preload prevents the default Ctrl/Cmd+C/X/V handling
 * and forwards the keydowns to the host. This strategy handles the keystrokes
 * directly using the async {@link Clipboard} API (`navigator.clipboard`),
 * which webviews are granted.
 *
 * Cut deletes synchronously once the text is captured; the clipboard write is
 * fire-and-forget. Paste must wait for the async read before inserting.
 * Handled keydowns must not reach the host, which may replay native clipboard
 * commands even when the browser's default has been prevented.
 */
export class AsyncClipboardStrategy implements IClipboardStrategy {
    constructor(private readonly _clipboard: Clipboard = navigator.clipboard) { }

    connect(context: IClipboardContext): IDisposable {
        const onKeyDown = (e: KeyboardEvent): void => {
            const ctrl = e.ctrlKey || e.metaKey;
            if (!ctrl || e.altKey) { return; }
            const nestedEditable = findNestedEditableClipboardTarget(e.target, context.element);
            if (nestedEditable) {
                handleNestedEditableClipboard(e, nestedEditable, this._clipboard);
                return;
            }
            if (isNestedMediaClipboardTarget(e.target, context.element)) { return; }

            switch (e.key.toLowerCase()) {
                case 'c': {
                    const text = context.getSelectedText();
                    if (text === undefined) { return; }
                    e.preventDefault();
                    e.stopPropagation();
                    void this._clipboard.writeText(text);
                    break;
                }
                case 'x': {
                    const text = context.getSelectedText();
                    if (text === undefined) { return; }
                    e.preventDefault();
                    e.stopPropagation();
                    void this._clipboard.writeText(text);
                    context.deleteSelection();
                    break;
                }
                case 'v': {
                    e.preventDefault();
                    e.stopPropagation();
                    void this._clipboard.readText().then(text => {
                        if (text) { context.insertText(text); }
                    });
                    break;
                }
            }
        };

        const el = context.element;
        el.addEventListener('keydown', onKeyDown);
        return { dispose: () => el.removeEventListener('keydown', onKeyDown) };
    }
}

/** Finds the nested editable that owns clipboard intent bubbling through the editor root. */
function findNestedEditableClipboardTarget(target: EventTarget | null, editorRoot: HTMLElement): HTMLElement | undefined {
    if (!(target instanceof Node) || target === editorRoot) { return undefined; }
    const element = target instanceof Element ? target : target.parentElement;
    const editable = element?.closest('input, textarea, [contenteditable]:not([contenteditable="false"]), [role="textbox"]');
    return editable instanceof HTMLElement && editorRoot.contains(editable) ? editable : undefined;
}

function isNestedMediaClipboardTarget(target: EventTarget | null, editorRoot: HTMLElement): boolean {
    if (!(target instanceof Node) || target === editorRoot) { return false; }
    const element = target instanceof Element ? target : target.parentElement;
    const media = element?.closest('video, audio');
    return media instanceof HTMLMediaElement && editorRoot.contains(media);
}

function handleNestedEditableClipboard(event: KeyboardEvent, editable: HTMLElement, clipboard: Clipboard): void {
    switch (event.key.toLowerCase()) {
        case 'c': {
            const text = selectedEditableText(editable);
            if (text === undefined) { return; }
            event.preventDefault();
            event.stopPropagation();
            void clipboard.writeText(text);
            return;
        }
        case 'x': {
            const text = selectedEditableText(editable);
            if (text === undefined) { return; }
            event.preventDefault();
            event.stopPropagation();
            void clipboard.writeText(text);
            replaceEditableSelection(editable, '');
            return;
        }
        case 'v':
            event.preventDefault();
            event.stopPropagation();
            void clipboard.readText().then(text => {
                if (text.length > 0) {
                    replaceEditableSelection(editable, text);
                }
            });
    }
}

function selectedEditableText(editable: HTMLElement): string | undefined {
    if (editable instanceof HTMLInputElement || editable instanceof HTMLTextAreaElement) {
        const start = editable.selectionStart;
        const end = editable.selectionEnd;
        if (start === null || end === null || start === end) { return undefined; }
        return editable.value.slice(start, end);
    }
    const selection = editable.ownerDocument.getSelection();
    if (
        !selection
        || selection.isCollapsed
        || selection.rangeCount === 0
        || !editable.contains(selection.getRangeAt(0).commonAncestorContainer)
    ) {
        return undefined;
    }
    return selection.toString();
}

function replaceEditableSelection(editable: HTMLElement, text: string): void {
    if (editable instanceof HTMLInputElement || editable instanceof HTMLTextAreaElement) {
        const start = editable.selectionStart ?? editable.value.length;
        const end = editable.selectionEnd ?? start;
        editable.setRangeText(text, start, end, 'end');
        editable.dispatchEvent(new InputEvent('input', {
            bubbles: true,
            inputType: text.length === 0 ? 'deleteByCut' : 'insertFromPaste',
            data: text,
        }));
        return;
    }

    const selection = editable.ownerDocument.getSelection();
    if (!selection || selection.rangeCount === 0 || !editable.contains(selection.getRangeAt(0).commonAncestorContainer)) {
        return;
    }
    const range = selection.getRangeAt(0);
    range.deleteContents();
    const node = editable.ownerDocument.createTextNode(text);
    range.insertNode(node);
    range.setStartAfter(node);
    range.collapse(true);
    selection.removeAllRanges();
    selection.addRange(range);
    editable.dispatchEvent(new InputEvent('input', {
        bubbles: true,
        inputType: text.length === 0 ? 'deleteByCut' : 'insertFromPaste',
        data: text,
    }));
}
