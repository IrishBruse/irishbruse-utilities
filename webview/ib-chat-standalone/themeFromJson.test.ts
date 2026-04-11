import { describe, expect, it } from "vitest";
import { parseThemeColorJson, themeColorsToWebviewRootCss } from "./themeFromJson";

describe("parseThemeColorJson", () => {
    it("parses flat colors and strips comments and trailing comma", () => {
        const raw = `{
            "editor.background": "#111",
            // c
            "editor.foreground": "#222",
        }`;
        expect(parseThemeColorJson(raw)).toEqual({
            "editor.background": "#111",
            "editor.foreground": "#222",
        });
    });
});

describe("themeColorsToWebviewRootCss", () => {
    it("emits vscode variables and aliases", () => {
        const css = themeColorsToWebviewRootCss({
            "editor.background": "#282c34",
            "editor.foreground": "#abb2bf",
        });
        expect(css).toContain("--vscode-editor-background: #282c34;");
        expect(css).toContain("--vscode-editor-foreground: #abb2bf;");
        expect(css).toContain("--vscode-foreground: var(--vscode-editor-foreground);");
    });
});
