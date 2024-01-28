import {
    InputBoxValidationMessage,
    Position,
    Range,
    Selection,
    TextEditor,
    TextEditorDecorationType,
    TextEditorRevealType,
    ThemeColor,
    window,
} from "vscode";

let oldPosition: Position;

export async function relativeGoTo(type: "up" | "down" | "absolute" = "down") {
    // Get editor
    const editor = window.activeTextEditor;

    if (!editor) {
        return;
    }

    let initValue;

    if (type === "absolute") {
        initValue = " ";
    } else if (type === "down") {
        initValue = "";
    } else if (type === "up") {
        initValue = "-";
    }

    oldPosition = editor.selection.active;

    // Get input from user
    const input: string | undefined = await window.showInputBox({
        value: initValue,
        prompt: "Jump ('' relative down, '-' relative up, ' ' absolute)",
        valueSelection: [1, 1],
        validateInput: peek,
    });

    removeHighlights(editor);

    if (!input) {
        editor.selection = new Selection(oldPosition, oldPosition);
        return;
    }

    editor?.revealRange(editor.selection);
}

const lineHighlight: TextEditorDecorationType = window.createTextEditorDecorationType({
    backgroundColor: new ThemeColor("editor.rangeHighlightBackground"),
    isWholeLine: true,
});

function peek(value: string): string | InputBoxValidationMessage | undefined | null {
    const editor = window.activeTextEditor;

    if (!editor) {
        return;
    }

    removeHighlights(editor);

    let inputNumber = parseInt(value);

    let lineNumber = oldPosition.line;

    // Absolute position
    if (value.length > 1 && value.startsWith(" ")) {
        if (isNaN(inputNumber)) {
            inputNumber = oldPosition.line;
        }
        lineNumber = inputNumber;
    } else {
        if (isNaN(inputNumber)) {
            inputNumber = 0;
        }
        lineNumber += inputNumber;
    }

    let targetPosition = new Position(lineNumber, 0);
    const range = new Range(targetPosition, targetPosition);
    editor.setDecorations(lineHighlight, [range]);
    editor.selection = new Selection(targetPosition, targetPosition);

    if (!editor.visibleRanges[0].contains(targetPosition)) {
        editor.revealRange(range, TextEditorRevealType.InCenter);
    }

    return;
}
function removeHighlights(editor: TextEditor) {
    editor.setDecorations(lineHighlight, []);
}
