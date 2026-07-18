import { readFile } from "fs/promises";
import path from "path";
import type { Extension } from "vscode";
import { extensions } from "vscode";

import { contributedLanguageIdToExtension } from "../constants";

const builtinLanguageIdToExtension: Record<string, string> = {
    bat: ".bat",
    c: ".c",
    cpp: ".cpp",
    csharp: ".cs",
    css: ".css",
    dart: ".dart",
    dockerfile: "Dockerfile",
    fsharp: ".fs",
    go: ".go",
    html: ".html",
    ini: ".ini",
    java: ".java",
    json: ".json",
    jsonc: ".jsonc",
    latex: ".tex",
    less: ".less",
    lua: ".lua",
    makefile: "Makefile",
    markdown: ".md",
    mermaid: ".mmd",
    "objective-c": ".m",
    "objective-cpp": ".mm",
    perl: ".pl",
    php: ".php",
    powershell: ".ps1",
    python: ".py",
    r: ".r",
    ruby: ".rb",
    rust: ".rs",
    scss: ".scss",
    shellscript: ".sh",
    sql: ".sql",
    swift: ".swift",
    javascript: ".js",
    javascriptreact: ".jsx",
    typescript: ".ts",
    typescriptreact: ".tsx",
    xml: ".xml",
    yaml: ".yaml",
};

const mapping: Record<string, string> = {
    ...builtinLanguageIdToExtension,
    ...contributedLanguageIdToExtension,
};

export function getExtensionFromLanguageId(languageId: string): string | undefined {
    return mapping[languageId];
}

type ContributedLanguageEntry = {
    id: string;
    configuration?: string;
};

function contributedLanguageEntries(extension: Extension<unknown>): ContributedLanguageEntry[] {
    const raw = extension.packageJSON.contributes?.languages;
    if (!Array.isArray(raw)) {
        return [];
    }
    const entries: ContributedLanguageEntry[] = [];
    for (const item of raw) {
        if (typeof item !== "object" || item === null || !("id" in item)) {
            continue;
        }
        const id = (item as { id: unknown }).id;
        if (typeof id !== "string") {
            continue;
        }
        const configuration =
            "configuration" in item && typeof (item as { configuration: unknown }).configuration === "string"
                ? (item as { configuration: string }).configuration
                : undefined;
        entries.push({ id, configuration });
    }
    return entries;
}

function lineCommentFromLanguageConfigFile(configData: unknown): string {
    if (typeof configData !== "object" || configData === null) {
        return "//";
    }
    const comments = (configData as { comments?: unknown }).comments;
    if (typeof comments !== "object" || comments === null) {
        return "//";
    }
    const lineComment = (comments as { lineComment?: unknown }).lineComment;
    if (typeof lineComment !== "string") {
        return "//";
    }
    return lineComment;
}

export async function getLineCommentSyntax(languageId: string): Promise<string> {
    for (const extension of extensions.all) {
        const lang = contributedLanguageEntries(extension).find((entry) => entry.id === languageId);
        if (!lang) {
            continue;
        }
        if (!lang.configuration) {
            return "//";
        }
        const configFilePath = path.join(extension.extensionPath, lang.configuration);
        try {
            const configData: unknown = JSON.parse(await readFile(configFilePath, "utf8"));
            return lineCommentFromLanguageConfigFile(configData);
        } catch {
            return "//";
        }
    }
    return "//";
}
