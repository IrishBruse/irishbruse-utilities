import * as monaco from "monaco-editor/editor/editor.api";

function wrapSelection(
    editor: monaco.editor.IStandaloneCodeEditor,
    model: monaco.editor.ITextModel,
    selection: monaco.Selection,
    before: string,
    after: string,
): monaco.Selection {
    const startOffset = model.getOffsetAt(selection.getStartPosition());
    const endOffset = model.getOffsetAt(selection.getEndPosition());
    const selected = model.getValue().slice(startOffset, endOffset);
    const prefix = model.getValue().slice(startOffset - before.length, startOffset);
    const suffix = model.getValue().slice(endOffset, endOffset + after.length);
    const wrapped = prefix === before && suffix === after;
    const text = wrapped ? selected : `${before}${selected}${after}`;
    const rangeStart = wrapped ? startOffset - before.length : startOffset;
    const rangeEnd = wrapped ? endOffset + after.length : endOffset;
    const start = model.getPositionAt(rangeStart);
    const end = model.getPositionAt(rangeEnd);
    editor.executeEdits("inline-md-wrap", [{
        range: new monaco.Range(start.lineNumber, start.column, end.lineNumber, end.column),
        text,
    }]);
    if (wrapped) {
        return monaco.Selection.fromPositions(
            model.getPositionAt(startOffset - before.length),
            model.getPositionAt(endOffset - before.length),
        );
    }
    return monaco.Selection.fromPositions(
        model.getPositionAt(startOffset + before.length),
        model.getPositionAt(endOffset + before.length),
    );
}

function wrapSelections(
    editor: monaco.editor.IStandaloneCodeEditor,
    before: string,
    after: string,
): void {
    if (editor.getOption(monaco.editor.EditorOption.readOnly)) {
        return;
    }
    const model = editor.getModel();
    const selections = editor.getSelections();
    if (!model || !selections) {
        return;
    }
    const ordered = [...selections].sort((left, right) => {
        return model.getOffsetAt(right.getStartPosition()) - model.getOffsetAt(left.getStartPosition());
    });
    const next: monaco.Selection[] = [];
    for (const selection of ordered) {
        if (selection.isEmpty()) {
            next.push(selection);
            continue;
        }
        next.push(wrapSelection(editor, model, selection, before, after));
    }
    if (next.some((selection) => !selection.isEmpty())) {
        editor.setSelections(next);
    }
}

function foreignField(target: EventTarget | null): boolean {
    if (!(target instanceof Element)) {
        return false;
    }
    return target.closest("input, textarea, select, [contenteditable='true']") !== null;
}

function forwardKeydown(event: KeyboardEvent, textarea: HTMLTextAreaElement): boolean {
    const forwarded = new KeyboardEvent("keydown", {
        key: event.key,
        code: event.code,
        ctrlKey: event.ctrlKey,
        shiftKey: event.shiftKey,
        altKey: event.altKey,
        metaKey: event.metaKey,
        repeat: event.repeat,
        bubbles: true,
        cancelable: true,
    });
    Object.defineProperty(forwarded, "keyCode", { get: () => event.keyCode });
    Object.defineProperty(forwarded, "which", { get: () => event.which });
    Object.defineProperty(forwarded, "charCode", { get: () => event.charCode });
    textarea.dispatchEvent(forwarded);
    return forwarded.defaultPrevented;
}

function typedText(event: KeyboardEvent): string | undefined {
    if (event.ctrlKey || event.metaKey || event.altKey || event.isComposing) {
        return undefined;
    }
    if (event.key.length !== 1) {
        return undefined;
    }
    return event.key;
}

export function installInlineKeybindings(
    editor: monaco.editor.IStandaloneCodeEditor,
    column: HTMLElement,
): () => void {
    const mod = monaco.KeyMod.CtrlCmd;
    editor.addCommand(mod | monaco.KeyCode.KeyD, () => {
        editor.trigger("inline-md", "editor.action.addSelectionToNextFindMatch", null);
    });
    editor.addCommand(mod | monaco.KeyCode.KeyF, () => {
        editor.trigger("inline-md", "actions.find", null);
    });
    editor.addCommand(mod | monaco.KeyCode.KeyB, () => {
        wrapSelections(editor, "**", "**");
    });
    editor.addCommand(mod | monaco.KeyCode.KeyI, () => {
        wrapSelections(editor, "*", "*");
    });
    editor.addCommand(mod | monaco.KeyCode.KeyU, () => {
        wrapSelections(editor, "<u>", "</u>");
    });

    const onKeyDown = (event: KeyboardEvent): void => {
        if (event.defaultPrevented) {
            return;
        }
        const target = event.target;
        if (target instanceof Node && column.contains(target)) {
            return;
        }
        if (foreignField(target)) {
            return;
        }
        const textarea = column.querySelector("textarea.inputarea");
        if (!(textarea instanceof HTMLTextAreaElement)) {
            return;
        }
        editor.focus();
        if (forwardKeydown(event, textarea)) {
            event.preventDefault();
            event.stopPropagation();
            return;
        }
        const text = typedText(event);
        if (text === undefined) {
            return;
        }
        editor.trigger("inline-md", "type", { text });
        event.preventDefault();
        event.stopPropagation();
    };
    window.addEventListener("keydown", onKeyDown, true);
    return () => {
        window.removeEventListener("keydown", onKeyDown, true);
    };
}
