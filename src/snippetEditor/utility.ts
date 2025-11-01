import cjson from "cjson";
import { readdir, readFile, writeFile } from "fs/promises";
import path from "path";
import { window, workspace } from "vscode";
import { UserPath } from "../extension";
import { getLineCommentSyntax } from "../utils/languages";
import { Snippet, Snippets } from "./SnippetView";

export const GeneratedMap = getGeneratedIdMappings();

export function trimStringArray(arr: string[]): string[] {
    if (!arr || arr.length === 0) {
        return [];
    }

    let start = 0;
    let end = arr.length - 1;

    // Find the first non-empty string from the start
    while (start <= end && (!arr[start] || arr[start].trim() === "")) {
        start++;
    }

    // Find the last non-empty string from the end
    while (end >= start && (!arr[end] || arr[end].trim() === "")) {
        end--;
    }

    // If start > end, it means the entire array was empty or contained only empty strings.
    if (start > end) {
        return [];
    }

    // Slice the array to remove the empty strings from the start and end
    return arr.slice(start, end + 1);
}

export function isECMA(languageId: string) {
    return (
        languageId === "typescript" ||
        languageId === "typescriptreact" ||
        languageId === "javascript" ||
        languageId === "javascriptreact" ||
        languageId === "react" ||
        languageId === "node"
    );
}

export function getSnippetsFile(languageId: string): Snippets {
    const snippetPath = path.join(UserPath, "snippets", languageId + ".json");
    return cjson.load(snippetPath);
}

export async function setSnippetsByLanguageId(languageId: string, snippets: Snippets) {
    const snippetPath = path.join(UserPath, "snippets", languageId + ".json");
    return await writeFile(snippetPath, JSON.stringify(snippets, null, 2));
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
    return Object.entries(mappings).reduce((acc, [key, value]) => {
        const arr = (value ?? "")
            .split(",")
            .map((v) => v.trim())
            .filter(Boolean);
        return {
            ...acc,
            [key]: arr,
        };
    }, {} as Record<string, string[]>);
}

export async function generateSnippetsForLanguage(languageId: string, dependencies: string[] = []) {
    let generatedSnippets: Snippets = {};

    for (const depLanguage of dependencies) {
        const depSnippets = getSnippetsFile(depLanguage);
        generatedSnippets = { ...generatedSnippets, ...depSnippets };
    }

    await setSnippetsByLanguageId(languageId, generatedSnippets);
}

export function reverseMap(inputMap: Record<string, string[]>): Record<string, string[]> {
    const reversedMap: { [key: string]: string[] } = {};

    for (const key in inputMap) {
        if (inputMap.hasOwnProperty(key)) {
            // Ensure key is directly on the object
            const values = inputMap[key];

            values.forEach((value) => {
                const trimmedValue = value.trim();

                if (!reversedMap[trimmedValue]) {
                    reversedMap[trimmedValue] = [];
                }
                reversedMap[trimmedValue].push(key);
            });
        }
    }

    return reversedMap;
}

export async function stringifySnippet(snippet: Snippet): Promise<string> {
    const lines: string[] = [];

    const l = (line: string, condition?: boolean) => {
        if (condition !== false) {
            lines.push(line);
        }
    };

    const c = await getLineCommentSyntax(snippet.languageId);

    const isEcma = isECMA(snippet.languageId);

    l(`${c} @languageId ${snippet.languageId ?? ""}`);
    l(`${c} @prefix ${snippet.prefix ?? ""}`);
    l(`${c} @description ${snippet.description ?? ""}`);
    l(`${c} @isFileTemplate ${snippet.isFileTemplate ?? ""}`);
    l(`${c}`, isEcma);
    l(`${c} @ts-nocheck`, isEcma);
    l(`${c} prettier-ignore`, isEcma);
    l(`${c} eslint-disable`, isEcma);
    l("");

    lines.push(...snippet.body);

    return lines.join("\n");
}

export async function parseSnippet(snippet: string): Promise<Snippet | null> {
    const lines: string[] = snippet.split("\n");

    const languageId = lines[0].split("@languageId")[1].trim();
    if (!languageId) {
        window.showErrorMessage(`missing @languageId directive`);
        return null;
    }

    const prefix = lines[1].split("@prefix")[1].trim();
    if (!prefix) {
        window.showErrorMessage(`missing @prefix directive`);
        return null;
    }

    const description = lines[2].split("@description")[1]?.trim() ?? "";
    const fileTemplate = lines[3].split("@isFileTemplate")[1]?.trim() ?? "";

    let startLine = 0;
    const c = await getLineCommentSyntax(languageId);
    while (lines[startLine].startsWith(c)) {
        startLine++;
    }

    const body = trimStringArray(lines.slice(startLine));

    return {
        languageId: languageId,
        prefix: prefix === "" ? undefined : prefix,
        description: description === "" ? undefined : description,
        isFileTemplate: fileTemplate === "" ? undefined : fileTemplate === "true",
        body,
    };
}
