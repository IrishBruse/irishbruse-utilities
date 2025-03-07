import { readFile } from "fs/promises";
import path from "path";
import { extensions, window } from "vscode";

const mapping: Record<string, string> = {
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

export function getExtensionFromLanguageId(languageId: string): string | undefined {
    return mapping[languageId];
}

export async function getLineCommentSyntax(languageId: string): Promise<string> {
    const languageExtension = extensions.all.find((ext) =>
        ext.packageJSON.contributes?.languages?.some((lang: any) => lang.id === languageId)
    );

    if (!languageExtension) {
        return "//";
    }

    // Locate the language-configuration.json file
    const languageConfigPath = languageExtension.packageJSON.contributes.languages.find(
        (lang: any) => lang.id === languageId
    )?.configuration;

    if (!languageConfigPath) {
        return "//";
    }

    const configFilePath = path.join(languageExtension.extensionPath, languageConfigPath);

    try {
        const configData = JSON.parse(await readFile(configFilePath, "utf8"));
        return configData.comments.lineComment ?? "//";
    } catch (error) {
        return "//";
    }
}
