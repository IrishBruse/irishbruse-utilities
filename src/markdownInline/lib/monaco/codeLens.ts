import * as monaco from "monaco-editor/editor/editor.api";
import { skillMarkdownLanguageId } from "../skill";

const openCommandId = "inline-md.openMermaidPreview";
const openHandlers = new Map<string, (openLine: number) => void>();
const lensEmitter = new monaco.Emitter<monaco.languages.CodeLensProvider>();

const lensProvider: monaco.languages.CodeLensProvider = {
    onDidChange: lensEmitter.event,
    provideCodeLenses() {
        return { lenses: [], dispose() {} };
    },
};

let installed = false;

export function installMermaidCodeLens(): void {
    if (installed) {
        return;
    }
    installed = true;
    for (const languageId of ["markdown", skillMarkdownLanguageId]) {
        monaco.languages.registerCodeLensProvider(languageId, lensProvider);
    }
    monaco.editor.registerCommand(openCommandId, (_accessor, uri: string, openLine: number) => {
        if (typeof uri !== "string" || typeof openLine !== "number" || !Number.isFinite(openLine)) {
            return;
        }
        openHandlers.get(uri)?.(openLine);
    });
}

export function bindMermaidCodeLens(
    model: monaco.editor.ITextModel,
    onOpenPreview: (openLine: number) => void,
): monaco.IDisposable {
    const key = model.uri.toString();
    openHandlers.set(key, onOpenPreview);
    lensEmitter.fire(lensProvider);
    return {
        dispose() {
            openHandlers.delete(key);
            lensEmitter.fire(lensProvider);
        },
    };
}

export function refreshMermaidCodeLens(): void {
    lensEmitter.fire(lensProvider);
}
