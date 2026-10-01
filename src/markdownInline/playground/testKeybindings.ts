import * as monaco from "monaco-editor/esm/vs/editor/editor.api";

function wrapSelection(
    editor: monaco.editor.IStandaloneCodeEditor,
    before: string,
    after: string,
): void {
    const model = editor.getModel();
    const selection = editor.getSelection();
    if (!model || !selection || selection.isEmpty()) {
        return;
    }
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
    editor.executeEdits("playground-wrap", [{
        range: new monaco.Range(start.lineNumber, start.column, end.lineNumber, end.column),
        text,
    }]);
    if (wrapped) {
        const anchor = model.getPositionAt(startOffset - before.length);
        const head = model.getPositionAt(endOffset - before.length);
        editor.setSelection(monaco.Selection.fromPositions(anchor, head));
    } else {
        const anchor = model.getPositionAt(startOffset + before.length);
        const head = model.getPositionAt(endOffset + before.length);
        editor.setSelection(monaco.Selection.fromPositions(anchor, head));
    }
}

export function installKeyboardWhitespaceTestKeybindings(editor: monaco.editor.IStandaloneCodeEditor): void {
    const mod = monaco.KeyMod.CtrlCmd;
    editor.addCommand(mod | monaco.KeyCode.KeyD, () => {
        editor.trigger("playground", "editor.action.addSelectionToNextFindMatch", null);
    });
    editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyF, () => {
        editor.trigger("playground", "actions.find", null);
    });
    editor.addCommand(mod | monaco.KeyCode.KeyB, () => {
        wrapSelection(editor, "**", "**");
    });
    editor.addCommand(mod | monaco.KeyCode.KeyI, () => {
        wrapSelection(editor, "*", "*");
    });
    editor.addCommand(mod | monaco.KeyCode.KeyU, () => {
        wrapSelection(editor, "<u>", "</u>");
    });
}
