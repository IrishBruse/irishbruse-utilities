import cjson from "cjson";
import { readdir, readFile, writeFile } from "fs/promises";
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

function directive(key: keyof typeof DIRECTIVES): string {
    return DIRECTIVE_PREFIX + DIRECTIVES[key];
}

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

    if (start > end) {
        return [];
    }

    return arr.slice(start, end + 1);
}

export function isECMA(languageId: string): boolean {
    return ECMA_LANGUAGES.has(languageId);
}

export function getSnippetsFile(languageId: string): Snippets {
    const snippetPath = path.join(UserPath, "snippets", languageId + ".json");
    return cjson.load(snippetPath);
}

export async function setSnippetsByLanguageId(languageId: string, snippets: Snippets) {
    const snippetPath = path.join(UserPath, "snippets", languageId + ".json");
    await updateSnippetFile(Uri.file(snippetPath), JSON.stringify(snippets, null, 2));
}

export async function getSnippetLanguages(): Promise<string[]> {
    const snippetsPath = path.join(UserPath, "snippets");
    const files = await readdir(snippetsPath);
    return files.filter((f) => f.endsWith(".json")).map((f) => f.slice(0, -5));
}

export function getLanguageIdMappings(): Record<string, string> {
    const config = workspace.getConfiguration("ib-utilities");
    return config.get("languageIdMappings") || {};
}

export function getGeneratedIdMappings(): Record<string, string[]> {
    const config = workspace.getConfiguration("ib-utilities");
    const mappings: Record<string, string> = config.get("generatedLanguageMappings") ?? {};
    return Object.entries(mappings).reduce(
        (acc, [key, value]) => {
            const arr = (value ?? "")
                .split(",")
                .map((v) => v.trim())
                .filter(Boolean);
            return {
                ...acc,
                [key]: arr,
            };
        },
        {} as Record<string, string[]>
    );
}

export async function generateSnippetsForLanguage(languageId: string, dependencies: string[] = []) {
    let generatedSnippets: Snippets = {};

    for (const depLanguage of dependencies) {
        const depSnippets = getSnippetsFile(depLanguage);
        generatedSnippets = { ...generatedSnippets, ...depSnippets };
    }

    await setSnippetsByLanguageId(languageId, generatedSnippets);
}

export function reverseMap<T>(inputMap: Record<string, T[]>): Record<string, T[]> {
    const reversedMap: Record<string, T[]> = {};

    for (const key in inputMap) {
        if (Object.prototype.hasOwnProperty.call(inputMap, key)) {
            const values = inputMap[key];

            for (const value of values) {
                const trimmedValue = String(value).trim();
                if (!reversedMap[trimmedValue]) {
                    reversedMap[trimmedValue] = [];
                }
                reversedMap[trimmedValue].push(key as unknown as T);
            }
        }
    }

    return reversedMap;
}

export class SnippetParser {
    private readonly commentSyntax: Promise<string>;

    constructor(private readonly languageId: string) {
        this.commentSyntax = getLineCommentSyntax(languageId);
    }

    async stringify(snippet: Snippet): Promise<string> {
        const lines: string[] = [];
        const c = await this.commentSyntax;
        const isEcma = isECMA(snippet.languageId);

        const l = (line: string, condition?: boolean) => {
            if (condition !== false) {
                lines.push(line);
            }
        };

        l(`${c} ${directive("languageId")} ${snippet.languageId ?? ""}`);
        l(`${c} ${directive("prefix")} ${snippet.prefix ?? ""}`);
        l(`${c} ${directive("description")} ${snippet.description ?? ""}`);
        l(`${c} ${directive("isFileTemplate")} ${snippet.isFileTemplate ?? ""}`);
        l(`${c}`, isEcma);
        l(`${c} @ts-nocheck`, isEcma);
        l(`${c} prettier-ignore`, isEcma);
        l(`${c} eslint-disable`, isEcma);
        l("");

        lines.push(...snippet.body);

        return lines.join("\n");
    }

    static async parse(snippet: string): Promise<Snippet | null> {
        const lines = snippet.split("\n");

        const languageId = SnippetParser.extractDirective(lines[0], directive("languageId"));
        if (!languageId) {
            window.showErrorMessage(`missing ${directive("languageId")} directive`);
            return null;
        }

        const prefix = SnippetParser.extractDirective(lines[1], directive("prefix"));
        if (!prefix) {
            window.showErrorMessage(`missing ${directive("prefix")} directive`);
            return null;
        }

        const description = SnippetParser.extractDirective(lines[2], directive("description")) ?? "";
        const fileTemplate = SnippetParser.extractDirective(lines[3], directive("isFileTemplate")) ?? "";

        const c = await getLineCommentSyntax(languageId);
        let startLine = 0;
        while (lines[startLine]?.startsWith(c)) {
            startLine++;
        }

        const body = trimStringArray(lines.slice(startLine));

        return {
            languageId,
            prefix: prefix === "" ? undefined : prefix,
            description: description === "" ? undefined : description,
            isFileTemplate: fileTemplate === "" ? undefined : fileTemplate === "true",
            body,
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

export async function stringifySnippet(snippet: Snippet): Promise<string> {
    return new SnippetParser(snippet.languageId).stringify(snippet);
}

export async function parseSnippet(snippet: string): Promise<Snippet | null> {
    return SnippetParser.parse(snippet);
}

export async function updateSnippetFile(uri: Uri, newContent: string) {
    const doc = await workspace.openTextDocument(uri);
    const editor = await window.showTextDocument(doc, { preview: true });

    await editor.edit((editBuilder) => {
        const fullRange = new Range(doc.positionAt(0), doc.positionAt(doc.getText().length));
        editBuilder.replace(fullRange, newContent);
    });

    await doc.save();
    await sleep(150);
    await commands.executeCommand("workbench.action.closeActiveEditor");
}
async function sleep(ms: number) {
    await new Promise((res) => setTimeout(res, ms));
}
