import * as monaco from "monaco-editor/esm/vs/editor/editor.api";
import { toMonacoColor } from "./monacoColor";
import "monaco-editor/min/vs/editor/editor.main.css";
import "monaco-editor/esm/vs/editor/browser/coreCommands.js";
import "monaco-editor/esm/vs/editor/contrib/clipboard/browser/clipboard.js";
import "monaco-editor/esm/vs/editor/contrib/codelens/browser/codelensController.js";
import "monaco-editor/esm/vs/editor/contrib/find/browser/findController.js";
import "monaco-editor/esm/vs/editor/contrib/linesOperations/browser/linesOperations.js";
import "monaco-editor/esm/vs/editor/contrib/multicursor/browser/multicursor.js";
import "monaco-editor/esm/vs/editor/contrib/suggest/browser/suggestController.js";
import "monaco-editor/esm/vs/editor/contrib/wordOperations/browser/wordOperations.js";
import { conf as markdownConf, language as markdownLanguage } from "monaco-editor/esm/vs/basic-languages/markdown/markdown.js";
import { conf as typescriptConf, language as typescriptLanguage } from "monaco-editor/esm/vs/basic-languages/typescript/typescript.js";
import { conf as yamlConf, language as yamlLanguage } from "monaco-editor/esm/vs/basic-languages/yaml/yaml.js";
import { completeSkillPropertyKeys, parseSkillFrontMatter } from "../../markdownEditor/webview/skillFrontMatterYaml";
import { completeAgentPropertyKeys } from "./skillKeys";
import { readFrontMatter } from "./skillProperties";
import { installMermaidCodeLens, refreshMermaidCodeLens } from "./mermaidCodeLens";

export { refreshMermaidCodeLens };
import { skillMarkdownLanguageId } from "./skillYaml";

let skillYamlInstalled = false;

export function installSkillYaml(): void {
    if (skillYamlInstalled) {
        return;
    }
    skillYamlInstalled = true;
    const register = (id: string, language: monaco.languages.IMonarchLanguage, conf: monaco.languages.LanguageConfiguration): void => {
        monaco.languages.register({ id });
        monaco.languages.setMonarchTokensProvider(id, language);
        monaco.languages.setLanguageConfiguration(id, conf);
    };
    register("yaml", yamlLanguage, yamlConf);
    register(skillMarkdownLanguageId, {
        ...markdownLanguage,
        tokenizer: {
            ...markdownLanguage.tokenizer,
            root: [
                [/^---$/, { token: "meta.separator", switchTo: "@skillFrontMatter", nextEmbedded: "yaml" }],
                [/^/, { token: "@rematch", switchTo: "@markdownBody" }],
            ],
            skillFrontMatter: [
                [/^---$/, { token: "meta.separator", switchTo: "@markdownBody", nextEmbedded: "@pop" }],
            ],
            markdownBody: markdownLanguage.tokenizer.root ?? [],
        },
    }, {
        ...markdownConf,
        wordPattern: /[A-Za-z0-9_-]+/,
    });
    monaco.languages.registerCompletionItemProvider(skillMarkdownLanguageId, {
        provideCompletionItems(model, position) {
            return { suggestions: skillKeyCompletions(model, position) };
        },
    });
}

function skillKeyCompletions(
    model: monaco.editor.ITextModel,
    position: monaco.Position,
): monaco.languages.CompletionItem[] {
    const span = readFrontMatter(model.getValue());
    if (!span) {
        return [];
    }
    const lineStart = model.getOffsetAt({ lineNumber: position.lineNumber, column: 1 });
    if (lineStart < span.yamlStart || lineStart >= span.yamlEnd) {
        return [];
    }
    const line = model.getLineContent(position.lineNumber);
    if (line.startsWith("#") || /^[ \t]/.test(line)) {
        return [];
    }
    const before = line.slice(0, position.column - 1);
    if (!/^[A-Za-z0-9_-]*$/.test(before)) {
        return [];
    }
    const keyLength = /^[A-Za-z0-9_-]*/.exec(line)?.[0].length ?? 0;
    if (position.column > keyLength + 1) {
        return [];
    }
    const existing = parseSkillFrontMatter(span.yaml).map((property) => property.key);
    const skillKeys = completeSkillPropertyKeys(existing, before);
    const extra = completeAgentPropertyKeys(existing, before).filter((key) => !skillKeys.includes(key));
    const hasColon = line.slice(keyLength).includes(":");
    const range = new monaco.Range(position.lineNumber, 1, position.lineNumber, keyLength + 1);
    return [...skillKeys, ...extra].map((key, index) => ({
        label: key,
        kind: monaco.languages.CompletionItemKind.Property,
        insertText: hasColon ? key : `${key}: `,
        sortText: String(index).padStart(2, "0"),
        range,
    }));
}

const hiddenAreaSource = {};

export function setHiddenAreas(editor: monaco.editor.IStandaloneCodeEditor, ranges: readonly monaco.IRange[]): void {
    const api = editor as monaco.editor.IStandaloneCodeEditor & {
        setHiddenAreas(next: readonly monaco.IRange[], source?: object): void;
    };
    api.setHiddenAreas(ranges, hiddenAreaSource);
}

function cssVariable(name: string): string {
    const root = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
    if (root.length > 0) {
        return root;
    }
    if (!document.body) {
        return "";
    }
    return getComputedStyle(document.body).getPropertyValue(name).trim();
}

function cssColor(name: string, fallback: string): string {
    return toMonacoColor(cssVariable(name)) ?? fallback;
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
    installSkillYaml();
    installMermaidCodeLens();
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
            { token: "type.yaml", foreground: "E06C75" },
            { token: "string.yaml", foreground: "98C379" },
            { token: "keyword.yaml", foreground: "56B6C2" },
            { token: "number.yaml", foreground: "D19A66" },
            { token: "operators.yaml", foreground: "ABB2BF" },
            { token: "comment.yaml", foreground: "5C6370" },
        ],
        colors: {
            "editor.background": cssColor("--vscode-editor-background", "#1e1e1e"),
            "editor.foreground": cssColor("--vscode-editor-foreground", "#d4d4d4"),
            "editorLineNumber.foreground": cssColor("--vscode-editorLineNumber-foreground", "#858585"),
            "editor.selectionBackground": cssColor("--vscode-editor-selectionBackground", "#3e4451"),
            "editor.inactiveSelectionBackground": cssColor(
                "--vscode-editor-inactiveSelectionBackground",
                cssColor("--vscode-editor-selectionBackground", "#3e4451"),
            ),
            "editor.lineHighlightBackground": cssColor("--vscode-editor-lineHighlightBackground", "#2a2d2e"),
            "editor.lineHighlightBorder": "#00000000",
            "editorCursor.foreground": cssColor("--vscode-editorCursor-foreground", "#aeafad"),
        },
    });
}

export function readEditorFontSize(): number {
    const raw = cssVariable("--vscode-editor-font-size");
    const size = Number.parseFloat(raw);
    if (Number.isFinite(size) && size > 0) {
        return size;
    }
    return 14;
}
