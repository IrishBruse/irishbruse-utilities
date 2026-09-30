import * as monaco from "monaco-editor/esm/vs/editor/editor.api";
import "monaco-editor/min/vs/editor/editor.main.css";
import { conf as markdownConf, language as markdownLanguage } from "monaco-editor/esm/vs/basic-languages/markdown/markdown.js";
import { conf as typescriptConf, language as typescriptLanguage } from "monaco-editor/esm/vs/basic-languages/typescript/typescript.js";

const hiddenAreaSource = {};

export function setHiddenAreas(editor: monaco.editor.IStandaloneCodeEditor, ranges: readonly monaco.IRange[]): void {
    const api = editor as monaco.editor.IStandaloneCodeEditor & {
        setHiddenAreas(next: readonly monaco.IRange[], source?: object): void;
    };
    api.setHiddenAreas(ranges, hiddenAreaSource);
}

function cssColor(name: string, fallback: string): string {
    const value = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
    if (/^#(?:[0-9a-fA-F]{3,4}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/.test(value)) {
        return value;
    }
    return fallback;
}

function editorWorkerUrl(): string {
    const meta = document.querySelector('meta[name="inline-md-worker"]');
    if (meta instanceof HTMLMetaElement && meta.content.length > 0) {
        return meta.content;
    }
    return new URL("monaco-editor/esm/vs/editor/editor.worker.js", import.meta.url).href;
}

let installed = false;

export function installMonaco(): void {
    if (installed) {
        return;
    }
    installed = true;
    const scope = globalThis as typeof globalThis & {
        MonacoEnvironment?: { getWorker(workerId: string, label: string): Worker };
    };
    scope.MonacoEnvironment = {
        getWorker() {
            return new Worker(editorWorkerUrl());
        },
    };

    const register = (id: string, language: monaco.languages.IMonarchLanguage, conf: monaco.languages.LanguageConfiguration): void => {
        monaco.languages.register({ id });
        monaco.languages.setMonarchTokensProvider(id, language);
        monaco.languages.setLanguageConfiguration(id, conf);
    };

    register("markdown", markdownLanguage as monaco.languages.IMonarchLanguage, markdownConf as monaco.languages.LanguageConfiguration);
    const typescript = typescriptLanguage as monaco.languages.IMonarchLanguage;
    const typescriptConfiguration = typescriptConf as monaco.languages.LanguageConfiguration;
    register("typescript", typescript, typescriptConfiguration);
    register("ts", typescript, typescriptConfiguration);
    register("javascript", typescript, typescriptConfiguration);
    register("js", typescript, typescriptConfiguration);

    monaco.editor.defineTheme("inline-markdown", {
        base: "vs-dark",
        inherit: true,
        rules: [
            { token: "keyword.md", foreground: "569CD6" },
            { token: "strong.md", fontStyle: "bold" },
            { token: "emphasis.md", fontStyle: "italic" },
            { token: "variable.md", foreground: "C678DD" },
            { token: "string.link.md", foreground: "35A854" },
            { token: "comment.md", foreground: "9DA5B4" },
            { token: "string.md", foreground: "CE9178" },
        ],
        colors: {
            "editor.background": cssColor("--vscode-editor-background", "#1e1e1e"),
            "editor.foreground": cssColor("--vscode-editor-foreground", "#d4d4d4"),
            "editorLineNumber.foreground": cssColor("--vscode-editorLineNumber-foreground", "#858585"),
            "editor.selectionBackground": cssColor("--vscode-editor-selectionBackground", "#264f78"),
            "editor.lineHighlightBackground": cssColor("--vscode-editor-lineHighlightBackground", "#2a2d2e"),
            "editorCursor.foreground": cssColor("--vscode-editorCursor-foreground", "#aeafad"),
        },
    });
}

export function readEditorFontSize(): number {
    const raw = getComputedStyle(document.documentElement).getPropertyValue("--vscode-editor-font-size").trim();
    const size = Number.parseFloat(raw);
    if (Number.isFinite(size) && size > 0) {
        return size;
    }
    return 14;
}
