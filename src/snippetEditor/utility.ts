import cjson from "cjson";
import { writeFile, readdir } from "fs/promises";
import path from "path";
import { Uri, window, TabInputText } from "vscode";
import { UserPath } from "../extension";
import { Snippets } from "./SnippetView";

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
        languageId === "javascriptreact"
    );
}

export function getAllOpenTabUris(): Uri[] {
    const tabGroups = window.tabGroups.all;
    const uris: Uri[] = [];

    for (const group of tabGroups) {
        for (const tab of group.tabs) {
            if (tab.input instanceof TabInputText) {
                uris.push(tab.input.uri);
            }
        }
    }
    return uris;
}

export function getSnippetsByLanguageId(languageId: string): Snippets {
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
