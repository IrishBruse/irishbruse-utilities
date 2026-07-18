import { describe, expect, it } from "vitest";
import {
    blendHex,
    getThemeCSS,
    getThemeVariables,
    getTokens,
    isValidHexColor,
    parseHex,
    pickBlended,
    type ColorPicker,
    type MermaidTokens,
} from "./vsCodeTheme";

const MOCK_COLORS: Record<string, string> = {
    "--vscode-editor-background": "#282c34",
    "--vscode-editor-foreground": "#abb2bf",
    "--vscode-foreground": "#abb2bf",
    "--vscode-editorWidget-background": "#21252b",
    "--vscode-input-background": "#252931",
    "--vscode-sideBar-background": "#21252b",
    "--vscode-editorWidget-border": "#3a3f4b",
    "--vscode-panel-border": "#3a3f4b",
    "--vscode-editorGroup-border": "#3a3f4b",
    "--vscode-sideBarSectionHeader-border": "#3a3f4b",
    "--vscode-sideBarSectionHeader-background": "#252931",
    "--vscode-descriptionForeground": "#5c6370",
    "--vscode-editorLineNumber-foreground": "#5c6370",
    "--vscode-focusBorder": "#35a854",
    "--vscode-textLink-foreground": "#61afef",
    "--vscode-button-background": "#35a854",
    "--vscode-list-activeSelectionBackground": "#3e4451",
    "--vscode-editor-selectionBackground": "#3e4451",
    "--vscode-list-focusBackground": "#3e4451",
    "--vscode-charts-blue": "#61afef",
    "--vscode-charts-orange": "#d19a66",
    "--vscode-charts-purple": "#c678dd",
    "--vscode-charts-red": "#e06c75",
    "--vscode-charts-yellow": "#e5c07b",
    "--vscode-charts-green": "#98c379",
    "--vscode-badge-background": "#4b5263",
    "--vscode-button-secondaryBackground": "#3e4451",
    "--vscode-editorError-foreground": "#e06c75",
    "--vscode-editorError-background": "#3e2c2c",
    "--vscode-inputValidation-errorBackground": "#3e2c2c",
    "--vscode-editorWarning-background": "#3e3a2c",
    "--vscode-editorWarning-border": "#e5c07b",
    "--vscode-editorIndentGuide-background": "#3a3f4b",
};

const mockPickColor: ColorPicker = (...varNames) => {
    for (const name of varNames) {
        if (MOCK_COLORS[name]) {
            return MOCK_COLORS[name];
        }
    }
    return undefined;
};

const mockReadCssVar = (name: string) => (name === "--vscode-font-family" ? "Cascadia Code" : "");

function getMockTokens(dark = true): MermaidTokens {
    return getTokens(mockPickColor, mockReadCssVar, () => dark);
}

describe("mermaidEditor/vsCodeTheme", () => {
    describe("color utilities", () => {
        it("parseHex and blendHex round-trip", () => {
            expect(parseHex("#ff0000")).toEqual({ r: 255, g: 0, b: 0 });
            expect(blendHex("#000000", "#ffffff", 0.5)).toBe("#808080");
        });

        it("pickBlended prefers blended colors", () => {
            const blended = pickBlended(mockPickColor, ["--vscode-editor-background"], ["--vscode-editor-foreground"], 0.5);
            expect(blended).toBeDefined();
            expect(isValidHexColor(blended!)).toBe(true);
        });
    });

    describe("getTokens", () => {
        it("returns semantic tokens with valid hex colors", () => {
            const tokens = getMockTokens();
            const colorKeys: (keyof MermaidTokens)[] = [
                "fg",
                "bg",
                "surface",
                "surfaceAlt",
                "sidebar",
                "border",
                "line",
                "muted",
                "accent",
                "selection",
                "warning",
                "warningBorder",
                "connectorMuted",
                "chartBlue",
                "chartPurple",
                "chartRed",
                "chartYellow",
            ];

            for (const key of colorKeys) {
                expect(isValidHexColor(tokens[key] as string), key).toBe(true);
            }

            expect(tokens.charts).toHaveLength(12);
            for (const color of tokens.charts) {
                expect(isValidHexColor(color)).toBe(true);
            }
        });
    });

    describe("getThemeVariables", () => {
        it("produces only defined string or boolean values", () => {
            const tokens = getMockTokens();
            const variables = getThemeVariables(tokens, mockPickColor);

            expect(variables.darkMode).toBe(true);
            for (const [key, value] of Object.entries(variables)) {
                expect(value, key).not.toBeUndefined();
                expect(["string", "boolean"]).toContain(typeof value);
                if (typeof value === "string" && key !== "fontFamily" && !key.endsWith("Opacity")) {
                    expect(isValidHexColor(value), key).toBe(true);
                }
            }
        });

        it("sets diagram-specific keys for gantt, git, and pie", () => {
            const variables = getThemeVariables(getMockTokens(), mockPickColor);
            expect(variables.taskBkgColor).toBeDefined();
            expect(variables.git0).toBeDefined();
            expect(variables.pie1).toBeDefined();
            expect(variables.cScale0).toBeDefined();
        });
    });

    describe("getThemeCSS", () => {
        it("includes generic cross-diagram selectors", () => {
            const css = getThemeCSS(getMockTokens());
            expect(css).toContain(".node:not(:has(.divider)) rect");
            expect(css).toContain(".edgePath path");
            expect(css).toContain(".cluster rect");
            expect(css).toContain("foreignObject");
            expect(css).toContain(".grid .tick text");
            expect(css).toContain(".task0, .task1");
            expect(css).toContain(".commit-label-bkg");
        });

        it("embeds token colors as hex values", () => {
            const tokens = getMockTokens();
            const css = getThemeCSS(tokens);
            expect(css).toContain(tokens.fg);
            expect(css).toContain(tokens.surface);
            expect(css).not.toContain("undefined");
        });
    });
});
