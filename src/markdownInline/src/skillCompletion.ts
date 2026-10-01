import * as monaco from "monaco-editor/esm/vs/editor/editor.api";
import { agentPropertyCompletions } from "./skillKeys";
import { readFrontMatter } from "./skillProperties";

function keysInYaml(yaml: string): string[] {
    const keys: string[] = [];
    for (const line of yaml.split("\n")) {
        const match = /^([A-Za-z0-9_-]+):/.exec(line);
        if (match?.[1]) {
            keys.push(match[1]);
        }
    }
    return keys;
}

export function registerSkillFrontMatterCompletion(
    editor: monaco.editor.IStandaloneCodeEditor,
): monaco.IDisposable {
    return monaco.languages.registerCompletionItemProvider("markdown", {
        provideCompletionItems(model, position) {
            if (model !== editor.getModel()) {
                return { suggestions: [] };
            }
            const text = model.getValue();
            const span = readFrontMatter(text);
            if (!span) {
                return { suggestions: [] };
            }
            const offset = model.getOffsetAt(position);
            if (offset < span.yamlStart || offset > span.yamlEnd) {
                return { suggestions: [] };
            }
            const line = model.getLineContent(position.lineNumber);
            const before = line.slice(0, position.column - 1);
            const keys = agentPropertyCompletions(keysInYaml(span.yaml), before);
            if (!keys || keys.length === 0) {
                return { suggestions: [] };
            }
            const startColumn = position.column - before.length;
            return {
                suggestions: keys.map((key) => ({
                    label: key,
                    kind: monaco.languages.CompletionItemKind.Property,
                    insertText: `${key}: `,
                    range: new monaco.Range(position.lineNumber, startColumn, position.lineNumber, position.column),
                })),
            };
        },
    });
}
