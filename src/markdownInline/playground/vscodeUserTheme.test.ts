import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
    colorIdToCssVariable,
    parseIframeInjectedThemeHtml,
    parseSettingsJsonc,
    readVscodeUserTheme,
    vscodeUserSettingsPath,
    vscodeUserThemeFromSettings,
} from "./vscodeUserTheme";

const playgroundDir = dirname(fileURLToPath(import.meta.url));
const iframeThemeCssPath = join(playgroundDir, "vscode-iframe-injected-theme.css");

describe("vscodeUserSettingsPath", () => {
    it("uses the Linux Code user settings path", () => {
        expect(
            vscodeUserSettingsPath({
                home: "/home/me",
                platform: "linux",
                xdgConfigHome: "/home/me/.config",
            }),
        ).toBe("/home/me/.config/Code/User/settings.json");
    });
});

describe("parseSettingsJsonc", () => {
    it("keeps strings and drops comments and trailing commas", () => {
        const settings = parseSettingsJsonc(`{
            // theme
            "workbench.colorTheme": "Quiet Light",
            "note": "keep // this",
            "workbench.colorCustomizations": {
                "editor.background": "#ffffff", /* white */
            },
        }`);
        expect(settings["workbench.colorTheme"]).toBe("Quiet Light");
        expect(settings["note"]).toBe("keep // this");
    });
});

describe("vscodeUserThemeFromSettings", () => {
    it("maps color customizations onto vscode CSS variables", () => {
        const theme = vscodeUserThemeFromSettings({
            "workbench.colorTheme": "Empty Dark Theme",
            "workbench.colorCustomizations": {
                "editor.background": "#111111",
                "editorWidget.border": "#3a3f4b",
                "textLink.foreground": "#35A854",
                "[Empty Dark Theme]": {
                    "editor.background": "#282c34",
                },
                "[Other Theme]": {
                    "editor.background": "#ffffff",
                },
                "not a color": "#ffffff",
                "editor.foreground": "red; background: url(evil)",
            },
            "markdownInlineEditor.colors.heading1": "#D19A66",
            "markdownInlineEditor.colors.inlineCodeBackground": "#21252bA0",
            "editor.fontFamily": "Cascadia Code, Symbols Nerd Font",
            "markdown.preview.fontFamily": "Cascadia Code, Symbols Nerd Font",
            "markdown.preview.fontSize": 12,
            "editor.fontLigatures": true,
        });

        expect(theme.bodyClass).toBe("vscode-dark");
        expect(theme.css).toContain(".inline-md-root .monaco-editor {");
        expect(colorIdToCssVariable("editorWidget.border")).toBe("--vscode-editorWidget-border");
        expect(theme.css).toContain("--vscode-editor-background: #282c34;");
        expect(theme.css).not.toContain("#111111");
        expect(theme.css).not.toContain("#ffffff");
        expect(theme.css).toContain("--vscode-editorWidget-border: #3a3f4b;");
        expect(theme.css).toContain("--vscode-textLink-foreground: #35A854;");
        expect(theme.css).toContain("--ib-md-heading-1: #D19A66;");
        expect(theme.css).toContain("--ib-md-inline-code-background: #21252bA0;");
        expect(theme.css).toContain('--markdown-font-family: "Cascadia Code", "Symbols Nerd Font";');
        expect(theme.css).toContain("--markdown-font-size: 12px;");
        expect(theme.css).toContain("font-variant-ligatures: common-ligatures;");
        expect(theme.css).not.toContain("evil");
    });

    it("derives checkbox tokens and scopes workbench colors onto monaco", () => {
        const theme = vscodeUserThemeFromSettings({
            "workbench.colorTheme": "Empty Dark Theme",
            "workbench.colorCustomizations": {
                "dropdown.background": "#353b45",
                "dropdown.border": "#21252B",
                "button.background": "#35A854",
                "button.foreground": "#ffffff",
                "focusBorder": "#35A854",
            },
        });
        expect(theme.css).toContain("--vscode-checkbox-background: #353b45;");
        expect(theme.css).toContain("--vscode-checkbox-border: #21252B;");
        expect(theme.css).toContain("--vscode-button-background: #35A854;");
        expect(theme.css).toContain("--vscode-inputOption-activeBorder: #35A854;");
        expect(theme.css).toContain(".inline-md-root .monaco-editor {");
    });

    it("treats light theme names as a light color scheme", () => {
        const theme = vscodeUserThemeFromSettings({
            "workbench.colorTheme": "Quiet Light",
            "workbench.colorCustomizations": {
                "editor.background": "#ffffff",
            },
        });
        expect(theme.bodyClass).toBe("vscode-light");
        expect(theme.css).toContain("color-scheme: light;");
    });
});

describe("parseIframeInjectedThemeHtml", () => {
    it("reads custom properties from the iframe html style attribute", () => {
        const declarations = parseIframeInjectedThemeHtml(`<html lang="en" style="
        --vscode-button-background: #35a854;
        --text-link-decoration: none;
    ">`);
        expect(declarations).toContain("--vscode-button-background: #35a854;");
        expect(declarations).toContain("--text-link-decoration: none;");
    });
});

describe("vscode-iframe-injected-theme.css", () => {
    it("includes the webview checkbox and button tokens", () => {
        const css = readFileSync(iframeThemeCssPath, "utf8");
        expect(css.toLowerCase()).toContain("--vscode-button-background: #35a854");
        expect(css.toLowerCase()).toContain("--vscode-checkbox-background: #353b45");
        expect(css).toContain(".inline-md-root .monaco-editor");
    });
});

describe("readVscodeUserTheme", () => {
    it("keeps the stand-in theme when settings.json is missing", () => {
        expect(readVscodeUserTheme("/no/such/settings.json")).toEqual({
            css: "",
            bodyClass: "vscode-dark",
        });
    });
});
