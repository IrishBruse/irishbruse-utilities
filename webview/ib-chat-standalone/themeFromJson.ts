import { readFileSync } from "node:fs";

/**
 * Strips line and block comments, trailing commas, then parses theme color entries.
 */
export function parseThemeColorJson(raw: string): Record<string, string> {
    let text = raw.replace(/\/\*[\s\S]*?\*\//g, "");
    text = text.replace(/\/\/[^\n]*/g, "");
    text = text.replace(/,(\s*[}\]])/g, "$1");
    const obj = JSON.parse(text) as Record<string, unknown>;
    const out: Record<string, string> = {};
    for (const [k, v] of Object.entries(obj)) {
        if (typeof v === "string") {
            out[k] = v;
        }
    }
    return out;
}

/**
 * Maps VS Code theme color ids to webview CSS custom properties (same names VS Code injects).
 */
export function themeColorsToWebviewRootCss(colors: Record<string, string>): string {
    const lines: string[] = [];
    for (const [key, value] of Object.entries(colors)) {
        const segment = key.replace(/\./g, "-");
        lines.push(`  --vscode-${segment}: ${value};`);
    }
    const aliases = [
        "  --vscode-foreground: var(--vscode-editor-foreground);",
        "  --vscode-widget-border: var(--vscode-editorWidget-border);",
        "  --vscode-descriptionForeground: var(--vscode-tab-inactiveForeground, #969696);",
        "  --vscode-editor-inactiveSelectionBackground: var(--vscode-list-inactiveSelectionBackground);",
        "  --vscode-editor-font-family: ui-monospace, Consolas, 'Cascadia Code', 'Courier New', monospace;",
        "  --vscode-errorForeground: var(--vscode-terminal-ansiRed, #f48771);",
        "  --vscode-inputValidation-errorBackground: color-mix(in srgb, var(--vscode-errorForeground) 18%, transparent);",
        "  --vscode-inputValidation-errorBorder: var(--vscode-errorForeground);",
        "  --vscode-input-placeholderForeground: var(--vscode-tab-inactiveForeground);",
    ];
    return `:root {\n${lines.join("\n")}\n${aliases.join("\n")}\n}\n`;
}

/** Reads a VS Code-style theme.json (flat color map) and returns webview :root CSS. */
export function loadThemeWebviewCss(themePath: string): string {
    const raw = readFileSync(themePath, "utf-8");
    return themeColorsToWebviewRootCss(parseThemeColorJson(raw));
}
