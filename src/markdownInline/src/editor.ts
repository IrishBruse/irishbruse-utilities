import * as monaco from "monaco-editor/esm/vs/editor/editor.api";
import { InlinePresentation } from "./decorations";
import { installMonaco, readEditorFontSize } from "./monacoSetup";
import { parseScopes } from "./scopes";
import type { Scope } from "./types";

export interface InlineEdit {
    start: number;
    endExclusive: number;
    text: string;
}

export interface MountInlineEditorOptions {
    text: string;
    documentUrl: string;
    readOnly?: boolean;
    skillFrontMatter?: boolean;
    skillFolderName?: string;
    onEdit?: (edit: InlineEdit) => void;
    onHistory?: (command: "undo" | "redo") => void;
    onLink?: (href: string) => void;
}

export interface InlineEditorHandle {
    destroy(): void;
    setDocument(text: string): void;
    getDocument(): string;
    focus(): void;
    setCursor(offset: number): void;
}

function historyBindings(
    editor: monaco.editor.IStandaloneCodeEditor,
    onHistory: (command: "undo" | "redo") => void,
): void {
    const undo = monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyZ;
    const redo = monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyY;
    const redoShift = monaco.KeyMod.CtrlCmd | monaco.KeyMod.Shift | monaco.KeyCode.KeyZ;
    editor.addCommand(undo, () => {
        onHistory("undo");
    });
    editor.addCommand(redo, () => {
        onHistory("redo");
    });
    editor.addCommand(redoShift, () => {
        onHistory("redo");
    });
}

function toggledTaskMarker(source: string): string {
    const index = source.search(/[xX]/);
    if (index >= 0) {
        return `${source.slice(0, index)} ${source.slice(index + 1)}`;
    }
    return source.replace("[ ]", "[x]");
}

function linkHref(source: string, position: number): string | undefined {
    let found: Scope | undefined;
    for (const scope of parseScopes(source)) {
        if (scope.kind !== "link" || !scope.url) {
            continue;
        }
        if (position < scope.start || position > scope.end) {
            continue;
        }
        if (!found || scope.end - scope.start < found.end - found.start) {
            found = scope;
        }
    }
    return found?.url;
}

function endOfLine(text: string): monaco.editor.EndOfLineSequence {
    if (text.includes("\r\n")) {
        return monaco.editor.EndOfLineSequence.CRLF;
    }
    return monaco.editor.EndOfLineSequence.LF;
}

export function mountInlineEditor(parent: HTMLElement, options: MountInlineEditorOptions): InlineEditorHandle {
    installMonaco();
    const hadRoot = parent.classList.contains("inline-md-root");
    parent.classList.add("inline-md-root");
    const column = document.createElement("div");
    column.className = "inline-md-column";
    parent.append(column);

    const model = monaco.editor.createModel(options.text, "markdown");
    model.setEOL(endOfLine(options.text));
    const editor = monaco.editor.create(column, {
        model,
        theme: "inline-markdown",
        readOnly: options.readOnly === true,
        automaticLayout: true,
        wordWrap: "on",
        wrappingStrategy: "advanced",
        lineNumbers: "on",
        glyphMargin: false,
        folding: false,
        lineDecorationsWidth: 16,
        lineNumbersMinChars: 3,
        minimap: { enabled: false },
        scrollBeyondLastLine: false,
        overviewRulerLanes: 0,
        hideCursorInOverviewRuler: true,
        overviewRulerBorder: false,
        scrollbar: { vertical: "auto", horizontal: "hidden", useShadows: false },
        renderLineHighlight: "line",
        fontFamily: getComputedStyle(document.documentElement).getPropertyValue("--vscode-editor-font-family").trim()
            || "ui-monospace, SFMono-Regular, Menlo, Consolas, monospace",
        fontSize: readEditorFontSize(),
        lineHeight: 0,
        padding: { top: 24, bottom: 48 },
        occurrencesHighlight: "off",
        selectionHighlight: false,
        renderWhitespace: "none",
        guides: { indentation: false, bracketPairs: false },
        stickyScroll: { enabled: false },
        quickSuggestions: false,
        suggestOnTriggerCharacters: false,
        wordBasedSuggestions: "off",
        parameterHints: { enabled: false },
        hover: { enabled: false },
        links: false,
        contextmenu: false,
        unicodeHighlight: { ambiguousCharacters: false, invisibleCharacters: false },
        bracketPairColorization: { enabled: false },
        matchBrackets: "never",
        renderValidationDecorations: "off",
        fixedOverflowWidgets: false,
    });
    model.updateOptions({ bracketColorizationOptions: { enabled: false } });

    let applyingHostUpdate = false;
    let refreshing = false;
    let refreshQueued = false;
    const presentation = new InlinePresentation(editor, options.documentUrl, {
        onToggleTask(from, to) {
            if (editor.getOption(monaco.editor.EditorOption.readOnly)) {
                return;
            }
            const currentModel = editor.getModel();
            if (!currentModel) {
                return;
            }
            const current = currentModel.getValue().slice(from, to);
            const next = toggledTaskMarker(current);
            if (next === current) {
                return;
            }
            replace(from, to, next);
        },
        onReveal(offset) {
            setCursor(offset);
            editor.focus();
        },
        onReplace(from, to, text) {
            replace(from, to, text);
        },
    }, options.skillFrontMatter === true, options.skillFolderName ?? "");

    const refresh = (): void => {
        if (refreshing) {
            refreshQueued = true;
            return;
        }
        refreshing = true;
        try {
            presentation.update();
        } finally {
            refreshing = false;
        }
        if (refreshQueued) {
            refreshQueued = false;
            refresh();
        }
    };

    const replace = (from: number, to: number, text: string): void => {
        const currentModel = editor.getModel();
        if (!currentModel) {
            return;
        }
        const start = currentModel.getPositionAt(from);
        const end = currentModel.getPositionAt(to);
        editor.executeEdits("inline-md", [{
            range: new monaco.Range(start.lineNumber, start.column, end.lineNumber, end.column),
            text,
        }]);
    };

    const setCursor = (offset: number): void => {
        const currentModel = editor.getModel();
        if (!currentModel) {
            return;
        }
        const clamped = Math.max(0, Math.min(offset, currentModel.getValueLength()));
        const position = currentModel.getPositionAt(clamped);
        editor.setPosition(position);
        editor.revealPositionInCenterIfOutsideViewport(position);
    };

    if (options.onHistory) {
        historyBindings(editor, options.onHistory);
    }

    const contentListener = editor.onDidChangeModelContent((event) => {
        refresh();
        if (applyingHostUpdate || !options.onEdit) {
            return;
        }
        const edits = event.changes.map((change) => ({
            start: change.rangeOffset,
            endExclusive: change.rangeOffset + change.rangeLength,
            text: change.text,
        }));
        edits.sort((left, right) => right.start - left.start);
        for (const edit of edits) {
            options.onEdit(edit);
        }
    });
    const cursorListener = editor.onDidChangeCursorSelection(() => {
        refresh();
    });
    const openRenderedLink = (event: MouseEvent): void => {
        if (event.button !== 0 || !options.onLink) {
            return;
        }
        const target = event.target;
        if (!(target instanceof Element) || !(target.closest(".inline-md-link") instanceof HTMLElement)) {
            return;
        }
        const hit = editor.getTargetAtClientPoint(event.clientX, event.clientY);
        const currentModel = editor.getModel();
        const position = hit?.position;
        if (!position || !currentModel) {
            return;
        }
        const href = linkHref(currentModel.getValue(), currentModel.getOffsetAt(position));
        if (!href) {
            return;
        }
        event.preventDefault();
        event.stopPropagation();
        options.onLink(href);
    };
    editor.getDomNode()?.addEventListener("mousedown", openRenderedLink, true);
    const mouseListener = editor.onMouseDown((event) => {
        const element = event.target.element;
        if (element instanceof Element) {
            const image = element.closest(".inline-md-image, .inline-md-image-fallback");
            if (image instanceof HTMLElement) {
                const from = Number(image.dataset.from);
                if (Number.isFinite(from)) {
                    event.event.preventDefault();
                    event.event.stopPropagation();
                    setCursor(from + 2);
                    editor.focus();
                }
            }
        }
    });

    refresh();
    editor.layout();

    return {
        destroy() {
            contentListener.dispose();
            cursorListener.dispose();
            mouseListener.dispose();
            editor.getDomNode()?.removeEventListener("mousedown", openRenderedLink, true);
            presentation.dispose();
            editor.dispose();
            model.dispose();
            column.remove();
            if (!hadRoot) {
                parent.classList.remove("inline-md-root");
            }
        },
        setDocument(text: string) {
            const current = model.getValue();
            if (current === text) {
                return;
            }
            const selection = editor.getSelection();
            const anchor = selection ? model.getOffsetAt(selection.getSelectionStart()) : 0;
            const head = selection ? model.getOffsetAt(selection.getPosition()) : 0;
            applyingHostUpdate = true;
            try {
                model.setEOL(endOfLine(text));
                model.setValue(text);
                const length = text.length;
                const start = model.getPositionAt(Math.max(0, Math.min(anchor, length)));
                const end = model.getPositionAt(Math.max(0, Math.min(head, length)));
                editor.setSelection(monaco.Selection.fromPositions(start, end));
            } finally {
                applyingHostUpdate = false;
            }
        },
        getDocument() {
            return model.getValue();
        },
        focus() {
            editor.focus();
        },
        setCursor,
    };
}
