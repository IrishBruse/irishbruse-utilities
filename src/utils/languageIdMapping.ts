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
    javascript: ".js",
    javascriptreact: ".jsx",
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
    typescript: ".ts",
    typescriptreact: ".tsx",
    xml: ".xml",
    yaml: ".yaml",
};

export function getExtensionFromLanguageId(languageId: string): string | undefined {
    return mapping[languageId];
}
