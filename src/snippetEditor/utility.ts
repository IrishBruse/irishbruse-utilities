import cjson from "cjson";
import { readdir } from "fs/promises";
import path from "path";
import { commands, Range, Uri, window, workspace } from "vscode";
import { UserPath } from "../extension";
import { getLineCommentSyntax } from "../utils/languages";
import { Snippet, Snippets } from "./SnippetView";

export const GeneratedMap = getGeneratedIdMappings();

export const ECMA_LANGUAGES = new Set([
    "typescript",
    "typescriptreact",
    "javascript",
    "javascriptreact",
    "react",
    "node",
]);

export const DIRECTIVE_PREFIX = "@";
export const DIRECTIVES = {
    languageId: "languageId",
    prefix: "prefix",
    description: "description",
    isFileTemplate: "isFileTemplate",
} as const;

export function trimStringArray(arr: string[]): string[] {
    if (!arr || arr.length === 0) {
        return [];
    }

    let start = 0;
    let end = arr.length - 1;

    while (start <= end && (!arr[start] || arr[start].trim() === "")) {
        start++;
    }
    while (end >= start && (!arr[end] || arr[end].trim() === "")) {
        end--;
    }

    return start > end ? [] : arr.slice(start, end + 1);
}

export function isECMA(languageId: string): boolean {
    return ECMA_LANGUAGES.has(languageId);
}

export function getSnippetsFile(languageId: string): Snippets {
    const snippetPath = path.join(UserPath, "snippets", `${languageId}.json`);
    return cjson.load(snippetPath);
}

export async function setSnippetsByLanguageId(languageId: string, snippets: Snippets): Promise<void> {
    const snippetPath = path.join(UserPath, "snippets", `${languageId}.json`);
    await updateSnippetFile(Uri.file(snippetPath), JSON.stringify(snippets, null, 2));
}

export async function getSnippetLanguages(): Promise<string[]> {
    const snippetsPath = path.join(UserPath, "snippets");
    const files = await readdir(snippetsPath);
    return files.filter((f) => f.endsWith(".json")).map((f) => f.slice(0, -5));
}

export function getLanguageIdMappings(): Record<string, string> {
    return workspace.getConfiguration("ib-utilities").get("languageIdMappings") ?? {};
}

export function getGeneratedIdMappings(): Record<string, string[]> {
    const mappings: Record<string, string> =
        workspace.getConfiguration("ib-utilities").get("generatedLanguageMappings") ?? {};

    return Object.entries(mappings).reduce(
        (acc, [key, value]) => {
            acc[key] = (value ?? "")
                .split(",")
                .map((v) => v.trim())
                .filter(Boolean);
            return acc;
        },
        {} as Record<string, string[]>
    );
}

export async function generateSnippetsForLanguage(languageId: string, dependencies: string[] = []): Promise<void> {
    const generatedSnippets = dependencies.reduce<Snippets>((acc, dep) => ({ ...acc, ...getSnippetsFile(dep) }), {});
    await setSnippetsByLanguageId(languageId, generatedSnippets);
}

export function reverseMap<T>(inputMap: Record<string, T[]>): Record<string, T[]> {
    const reversed: Record<string, T[]> = {};

    for (const [key, values] of Object.entries(inputMap)) {
        for (const value of values) {
            const k = String(value).trim();
            (reversed[k] ??= []).push(key as unknown as T);
        }
    }

    return reversed;
}

export class SnippetParser {
    private static directive(key: keyof typeof DIRECTIVES): string {
        return DIRECTIVE_PREFIX + DIRECTIVES[key];
    }

    static async stringify(snippet: Snippet): Promise<string> {
        const lines: string[] = [];
        const c = await getLineCommentSyntax(snippet.languageId);
        const isEcma = isECMA(snippet.languageId);

        const push = (line: string, condition = true) => {
            if (condition) {
                lines.push(line);
            }
        };

        push(`${c} ${SnippetParser.directive("languageId")} ${snippet.languageId ?? ""}`);
        push(`${c} ${SnippetParser.directive("prefix")} ${snippet.prefix ?? ""}`);
        push(`${c} ${SnippetParser.directive("description")} ${snippet.description ?? ""}`);
        push(`${c} ${SnippetParser.directive("isFileTemplate")} ${snippet.isFileTemplate ?? ""}`);
        push(`${c}`, isEcma);
        push(`${c} @ts-nocheck`, isEcma);
        push(`${c} prettier-ignore`, isEcma);
        push(`${c} eslint-disable`, isEcma);
        push("");

        lines.push(...snippet.body);
        return lines.join("\n");
    }

    static async parse(text: string): Promise<Snippet | null> {
        const lines = text.split("\n");

        const languageId = SnippetParser.extractDirective(lines[0], SnippetParser.directive("languageId"));
        if (!languageId) {
            window.showErrorMessage(`missing ${SnippetParser.directive("languageId")} directive`);
            return null;
        }

        const prefix = SnippetParser.extractDirective(lines[1], SnippetParser.directive("prefix"));
        if (prefix === undefined) {
            window.showErrorMessage(`missing ${SnippetParser.directive("prefix")} directive`);
            return null;
        }

        const description = SnippetParser.extractDirective(lines[2], SnippetParser.directive("description")) ?? "";
        const fileTemplate = SnippetParser.extractDirective(lines[3], SnippetParser.directive("isFileTemplate")) ?? "";

        const c = await getLineCommentSyntax(languageId);
        let startLine = 0;
        while (lines[startLine]?.startsWith(c)) {
            startLine++;
        }

        return {
            languageId,
            prefix: prefix || undefined,
            description: description || undefined,
            isFileTemplate: fileTemplate ? fileTemplate === "true" : undefined,
            body: trimStringArray(lines.slice(startLine)),
        };
    }

    private static extractDirective(line: string, directiveName: string): string | undefined {
        const index = line.indexOf(directiveName);
        if (index === -1) {
            return undefined;
        }
        return line.slice(index + directiveName.length).trim();
    }
}

export async function updateSnippetFile(uri: Uri, newContent: string): Promise<void> {
    const doc = await workspace.openTextDocument(uri);
    const editor = await window.showTextDocument(doc, { preview: true });

    await editor.edit((editBuilder) => {
        const fullRange = new Range(doc.positionAt(0), doc.positionAt(doc.getText().length));
        editBuilder.replace(fullRange, newContent);
    });

    await doc.save();
    await new Promise<void>((resolve) => setTimeout(resolve, 150));
    await commands.executeCommand("workbench.action.closeActiveEditor");
}
