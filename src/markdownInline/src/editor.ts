import * as monaco from "monaco-editor/esm/vs/editor/editor.api";
import { InlinePresentation } from "./decorations";
import { bindDragSelection, isDragSelecting } from "./dragSelection";
import { installInlineKeybindings } from "./keybindings";
import { bindMermaidCodeLens } from "./mermaidCodeLens";
import { installMonaco, readEditorFontSize } from "./monacoSetup";
import { parseScopes } from "./scopes";
import { readFrontMatter } from "./yamlFrontMatter";
import { skillMarkdownLanguageId } from "./skillYaml";
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
    onEdit?: (edit: InlineEdit) => void;
    onHistory?: (command: "undo" | "redo") => void;
    onLink?: (href: string) => void;
    onOpenMermaidPreview?: (openLine: number) => void;
}

export interface InlineEditorHandle {
    destroy(): void;
    setDocument(text: string): void;
    getDocument(): string;
    focus(): void;
    setCursor(offset: number): void;
    select(from: number, to: number): void;
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
    const unbindDragSelection = bindDragSelection(parent, () => {
        refresh();
        fitContent();
    });
    const column = document.createElement("div");
    column.className = "inline-md-column";
    parent.append(column);

    const usesSkillMarkdown = (text: string): boolean =>
        options.skillFrontMatter === true || readFrontMatter(text) !== undefined;
    const languageId = usesSkillMarkdown(options.text) ? skillMarkdownLanguageId : "markdown";
    const model = monaco.editor.createModel(options.text, languageId);
    model.setEOL(endOfLine(options.text));
    const editor = monaco.editor.create(column, {
        model,
        theme: "inline-markdown",
        readOnly: options.readOnly === true,
        automaticLayout: false,
        wordWrap: "on",
        wrappingStrategy: "advanced",
        scrollBeyondLastColumn: 0,
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
        scrollbar: {
            vertical: "hidden",
            horizontal: "hidden",
            useShadows: false,
            verticalScrollbarSize: 0,
            horizontalScrollbarSize: 0,
            handleMouseWheel: false,
            alwaysConsumeMouseWheel: false,
        },
        renderLineHighlight: "line",
        fontFamily: getComputedStyle(document.documentElement).getPropertyValue("--vscode-editor-font-family").trim()
            || "ui-monospace, SFMono-Regular, Menlo, Consolas, monospace",
        fontSize: readEditorFontSize(),
        lineHeight: 0,
        padding: { top: 0, bottom: 48 },
        occurrencesHighlight: "off",
        selectionHighlight: false,
        renderWhitespace: "none",
        guides: { indentation: false, bracketPairs: false },
        stickyScroll: { enabled: false },
        codeLens: true,
        codeLensFontSize: 11,
        quickSuggestions: usesSkillMarkdown(options.text) ? { other: true, comments: false, strings: true } : false,
        suggestOnTriggerCharacters: usesSkillMarkdown(options.text),
        wordBasedSuggestions: "off",
        parameterHints: { enabled: false },
        hover: { enabled: false },
        links: false,
        contextmenu: false,
        unicodeHighlight: { ambiguousCharacters: false, invisibleCharacters: false },
        bracketPairColorization: { enabled: false },
        matchBrackets: "never",
        renderValidationDecorations: "off",
        fixedOverflowWidgets: true,
    });
    model.updateOptions({
        bracketColorizationOptions: {
            enabled: false,
            independentColorPoolPerBracketType: false,
        },
    });

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
            revealOffset(offset);
        },
        onReplace(from, to, text) {
            replace(from, to, text);
        },
        onLink(href) {
            options.onLink?.(href);
        },
        onOpenMermaidPreview(openLine) {
            options.onOpenMermaidPreview?.(openLine);
        },
    }, options.skillFrontMatter === true);
    const mermaidLens = bindMermaidCodeLens(model, (openLine) => {
        options.onOpenMermaidPreview?.(openLine);
    });

    const refresh = (): void => {
        if (refreshing) {
            refreshQueued = true;
            return;
        }
        refreshing = true;
        try {
            const currentModel = editor.getModel();
            if (currentModel) {
                const text = currentModel.getValue();
                const nextLanguage = usesSkillMarkdown(text) ? skillMarkdownLanguageId : "markdown";
                if (currentModel.getLanguageId() !== nextLanguage) {
                    monaco.editor.setModelLanguage(currentModel, nextLanguage);
                    const suggestions = usesSkillMarkdown(text);
                    editor.updateOptions({
                        quickSuggestions: suggestions ? { other: true, comments: false, strings: true } : false,
                        suggestOnTriggerCharacters: suggestions,
                    });
                }
            }
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
        revealInParent(position, true);
    };

    const revealOffset = (offset: number): void => {
        presentation.prepareReveal(offset);
        setCursor(offset);
        editor.focus();
    };

    const revealInParent = (position: monaco.IPosition, center: boolean): void => {
        const node = editor.getDomNode();
        if (!node || parent.clientHeight === 0) {
            return;
        }
        const lineHeight = editor.getOption(monaco.editor.EditorOption.lineHeight);
        const top = editor.getTopForPosition(position.lineNumber, position.column) - editor.getScrollTop();
        const lineTop = node.getBoundingClientRect().top - parent.getBoundingClientRect().top + parent.scrollTop + top;
        const viewTop = parent.scrollTop;
        const viewBottom = viewTop + parent.clientHeight;
        if (center) {
            parent.scrollTop = Math.max(0, lineTop - parent.clientHeight / 2);
            return;
        }
        const margin = lineHeight;
        if (lineTop < viewTop + margin) {
            parent.scrollTop = Math.max(0, lineTop - margin);
        } else if (lineTop + lineHeight > viewBottom - margin) {
            parent.scrollTop = lineTop + lineHeight - parent.clientHeight + margin;
        }
    };

    if (options.onHistory) {
        historyBindings(editor, options.onHistory);
    }
    const removeKeybindings = installInlineKeybindings(editor, column);

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
        if (isDragSelecting()) {
            return;
        }
        refresh();
    });
    const openRenderedLink = (event: MouseEvent): void => {
        if (event.button !== 0 || !options.onLink) {
            return;
        }
        const target = event.target;
        const element = target instanceof Element
            ? target
            : target instanceof Node
                ? target.parentElement
                : null;
        const link = element?.closest(".inline-md-link");
        if (!(link instanceof HTMLElement)) {
            return;
        }
        let href = link.dataset.href;
        if (!href) {
            const hit = editor.getTargetAtClientPoint(event.clientX, event.clientY);
            const currentModel = editor.getModel();
            const position = hit?.position;
            if (!position || !currentModel) {
                return;
            }
            href = linkHref(currentModel.getValue(), currentModel.getOffsetAt(position));
        }
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
                    revealOffset(from + 2);
                }
            }
        }
    });

    let fitting = false;
    let fitFrame = 0;
    const fitNow = (): void => {
        if (isDragSelecting() || fitting || parent.clientWidth === 0 || parent.clientHeight === 0) {
            return;
        }
        fitting = true;
        try {
            const style = getComputedStyle(column);
            const pad = (Number.parseFloat(style.paddingLeft) || 0) + (Number.parseFloat(style.paddingRight) || 0);
            const width = Math.max(0, column.clientWidth - pad);
            const height = Math.max(1, Math.ceil(editor.getContentHeight()));
            const info = editor.getLayoutInfo();
            const heightMatches = column.style.height === `${height}px`;
            if (Math.abs(info.width - width) <= 1 && Math.abs(info.height - height) <= 1 && heightMatches) {
                return;
            }
            if (!heightMatches) {
                column.style.height = `${height}px`;
            }
            editor.layout({ width, height });
        } finally {
            fitting = false;
        }
    };
    const fitContent = (): void => {
        if (fitFrame !== 0) {
            return;
        }
        fitFrame = requestAnimationFrame(() => {
            fitFrame = 0;
            fitNow();
        });
    };
    const placeFindWidget = (): void => {
        const rootRect = parent.getBoundingClientRect();
        const columnRect = column.getBoundingClientRect();
        parent.style.setProperty("--ib-find-top", `${rootRect.top}px`);
        parent.style.setProperty("--ib-find-right", `${Math.max(0, window.innerWidth - columnRect.right)}px`);
    };
    const findController = editor.getContribution("editor.contrib.findController") as {
        getState(): { onFindReplaceStateChange(listener: () => void): monaco.IDisposable };
    } | null;
    const findVisibilityListener = findController?.getState().onFindReplaceStateChange(() => {
        placeFindWidget();
    });
    const contentSizeListener = editor.onDidContentSizeChange(fitContent);
    const cursorRevealListener = editor.onDidChangeCursorPosition((event) => {
        revealInParent(event.position, false);
    });
    window.addEventListener("resize", placeFindWidget, { passive: true });
    const resizeObserver = new ResizeObserver(() => {
        if (parent.clientWidth === 0 || parent.clientHeight === 0) {
            return;
        }
        fitContent();
        placeFindWidget();
    });
    resizeObserver.observe(parent);

    refresh();
    fitNow();
    placeFindWidget();

    return {
        destroy() {
            unbindDragSelection();
            resizeObserver.disconnect();
            if (fitFrame !== 0) {
                cancelAnimationFrame(fitFrame);
            }
            window.removeEventListener("resize", placeFindWidget);
            findVisibilityListener?.dispose();
            contentSizeListener.dispose();
            cursorRevealListener.dispose();
            removeKeybindings();
            contentListener.dispose();
            cursorListener.dispose();
            mouseListener.dispose();
            editor.getDomNode()?.removeEventListener("mousedown", openRenderedLink, true);
            mermaidLens.dispose();
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
        select(from: number, to: number) {
            const currentModel = editor.getModel();
            if (!currentModel) {
                return;
            }
            const length = currentModel.getValueLength();
            const start = currentModel.getPositionAt(Math.max(0, Math.min(from, length)));
            const end = currentModel.getPositionAt(Math.max(0, Math.min(to, length)));
            editor.focus();
            editor.setSelection(monaco.Selection.fromPositions(start, end));
        },
    };
}
