import * as monaco from "monaco-editor/esm/vs/editor/editor.api";
import { isMermaidCodeBlock } from "./preview/mermaid";
import { parseScopes } from "./document/scopes";
import { skillMarkdownLanguageId } from "./skillYaml";

const openCommandId = "inline-md.openMermaidPreview";
const openHandlers = new Map<string, (openLine: number) => void>();
const lensEmitter = new monaco.Emitter<monaco.languages.CodeLensProvider>();

const lensProvider: monaco.languages.CodeLensProvider = {
    onDidChange: lensEmitter.event,
    provideCodeLenses(model) {
        const handler = openHandlers.get(model.uri.toString());
        if (!handler) {
            return { lenses: [], dispose() {} };
        }
        const text = model.getValue();
        const lenses: monaco.languages.CodeLens[] = [];
        for (const scope of parseScopes(text)) {
            if (scope.kind !== "codeBlock" || !isMermaidCodeBlock(scope.language)) {
                continue;
            }
            const lineNumber = model.getPositionAt(scope.start).lineNumber;
            const openLine = lineNumber - 1;
            lenses.push({
                range: new monaco.Range(lineNumber, 1, lineNumber, 1),
                command: {
                    id: openCommandId,
                    title: "Open Preview",
                    arguments: [model.uri.toString(), openLine],
                },
            });
        }
        return { lenses, dispose() {} };
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
