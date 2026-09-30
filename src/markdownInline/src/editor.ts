import { defaultKeymap, history, historyKeymap, indentWithTab } from "@codemirror/commands";
import { EditorState, type Extension } from "@codemirror/state";
import { EditorView, drawSelection, highlightActiveLine, keymap, type KeyBinding } from "@codemirror/view";
import { documentUrlFacet, inlineDecorations } from "./decorations";
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
    onEdit?: (edit: InlineEdit) => void;
    onHistory?: (command: "undo" | "redo") => void;
    onLink?: (href: string) => void;
}

export interface InlineEditorHandle {
    destroy(): void;
    setDocument(text: string): void;
    getDocument(): string;
    focus(): void;
    readonly view: EditorView;
}

function historyBindings(onHistory: ((command: "undo" | "redo") => void) | undefined): readonly KeyBinding[] {
    if (!onHistory) {
        return historyKeymap;
    }
    const report = onHistory;
    return [
        {
            key: "Mod-z",
            preventDefault: true,
            run: () => {
                report("undo");
                return true;
            },
        },
        {
            key: "Mod-y",
            preventDefault: true,
            run: () => {
                report("redo");
                return true;
            },
        },
        {
            key: "Mod-Shift-z",
            preventDefault: true,
            run: () => {
                report("redo");
                return true;
            },
        },
    ];
}

function toggledTaskMarker(source: string): string {
    const index = source.search(/[xX]/);
    if (index >= 0) {
        return `${source.slice(0, index)} ${source.slice(index + 1)}`;
    }
    return source.replace("[ ]", "[x]");
}

function taskInput(target: EventTarget | null): HTMLInputElement | undefined {
    if (target instanceof HTMLInputElement && target.classList.contains("inline-md-task")) {
        return target;
    }
    return undefined;
}

function imageElement(target: EventTarget | null): HTMLElement | undefined {
    if (!(target instanceof Element)) {
        return undefined;
    }
    const found = target.closest(".inline-md-image, .inline-md-image-fallback");
    if (found instanceof HTMLElement) {
        return found;
    }
    return undefined;
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

function finiteOffset(value: string | undefined): number | undefined {
    if (value === undefined) {
        return undefined;
    }
    const offset = Number(value);
    if (!Number.isFinite(offset)) {
        return undefined;
    }
    return offset;
}

export function mountInlineEditor(parent: HTMLElement, options: MountInlineEditorOptions): InlineEditorHandle {
    const hadRoot = parent.classList.contains("inline-md-root");
    parent.classList.add("inline-md-root");

    const onHistory = options.onHistory;
    const extensions: Extension[] = [
        EditorView.lineWrapping,
        drawSelection(),
        highlightActiveLine(),
        EditorState.readOnly.of(options.readOnly === true),
        documentUrlFacet.of(options.documentUrl),
        inlineDecorations,
        keymap.of([
            ...historyBindings(onHistory),
            ...defaultKeymap,
            indentWithTab,
        ]),
    ];
    if (!onHistory) {
        extensions.push(history());
    }

    let applyingHostUpdate = false;
    const view = new EditorView({
        parent,
        state: EditorState.create({
            doc: options.text,
            extensions: [
                ...extensions,
                EditorView.updateListener.of((update) => {
                    if (!update.docChanged || applyingHostUpdate || !options.onEdit) {
                        return;
                    }
                    const edits: InlineEdit[] = [];
                    update.changes.iterChanges((fromA, toA, _fromB, _toB, inserted) => {
                        edits.push({ start: fromA, endExclusive: toA, text: inserted.toString() });
                    });
                    for (let index = edits.length - 1; index >= 0; index -= 1) {
                        const edit = edits[index];
                        if (edit) {
                            options.onEdit(edit);
                        }
                    }
                }),
            ],
        }),
    });

    const onMouseDown = (event: MouseEvent): void => {
        if (event.button !== 0) {
            return;
        }
        const task = taskInput(event.target);
        if (task) {
            event.preventDefault();
            event.stopPropagation();
            if (view.state.readOnly) {
                return;
            }
            const from = finiteOffset(task.dataset.from);
            const to = finiteOffset(task.dataset.to);
            if (from === undefined || to === undefined || to < from) {
                return;
            }
            const current = view.state.doc.sliceString(from, to);
            const next = toggledTaskMarker(current);
            if (next === current) {
                return;
            }
            view.dispatch({ changes: { from, to, insert: next } });
            return;
        }

        const image = imageElement(event.target);
        if (image) {
            event.preventDefault();
            event.stopPropagation();
            const from = finiteOffset(image.dataset.from);
            if (from === undefined) {
                return;
            }
            view.dispatch({ selection: { anchor: from + 1 } });
            return;
        }

        if (!options.onLink || !(event.ctrlKey || event.metaKey)) {
            return;
        }
        const position = view.posAtCoords({ x: event.clientX, y: event.clientY });
        if (position === null) {
            return;
        }
        const href = linkHref(view.state.doc.toString(), position);
        if (!href) {
            return;
        }
        event.preventDefault();
        event.stopPropagation();
        options.onLink(href);
    };
    view.dom.addEventListener("mousedown", onMouseDown, true);

    return {
        destroy() {
            view.dom.removeEventListener("mousedown", onMouseDown, true);
            view.destroy();
            if (!hadRoot) {
                parent.classList.remove("inline-md-root");
            }
        },
        setDocument(text: string) {
            if (view.state.doc.toString() === text) {
                return;
            }
            const length = text.length;
            const main = view.state.selection.main;
            applyingHostUpdate = true;
            try {
                view.dispatch({
                    changes: { from: 0, to: view.state.doc.length, insert: text },
                    selection: {
                        anchor: Math.max(0, Math.min(main.anchor, length)),
                        head: Math.max(0, Math.min(main.head, length)),
                    },
                });
            } finally {
                applyingHostUpdate = false;
            }
        },
        getDocument() {
            return view.state.doc.toString();
        },
        focus() {
            view.focus();
        },
        view,
    };
}
