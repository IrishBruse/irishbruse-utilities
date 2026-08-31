import { join } from "path";
import { describe, expect, it } from "vitest";
import {
    TextMateHighlighter,
    fontStyleFromMetadata,
    forEachSourceLine,
    foregroundFromMetadata,
    findTheme,
    hasScopedTokenColors,
    loadRawTheme,
    parseJsonc,
    parseThemeDocument,
    resolveLanguageId,
    toWebviewColorMap,
    tokenColorCustomizationsToSettings,
    unstyledHighlight,
    type HighlightingHost,
} from "./syntaxHighlighting";

const WASM_PATH = join(process.cwd(), "node_modules", "vscode-oniguruma", "release", "onig.wasm");

const TEST_GRAMMAR = JSON.stringify({
    scopeName: "source.testlang",
    patterns: [
        { name: "keyword.testlang", match: "hello" },
        { name: "string.testlang", match: "world" },
    ],
});

const TEST_THEME = JSON.stringify({
    name: "Test Theme",
    colors: {
        "editor.foreground": "#aabbcc",
        "editor.background": "#111111",
    },
    tokenColors: [
        { scope: "keyword.testlang", settings: { foreground: "#ff0000" } },
        { scope: "string.testlang", settings: { foreground: "#00ff00" } },
    ],
});

function tokenLength(tokens: readonly { length: number }[]): number {
    return tokens.reduce((sum, token) => sum + token.length, 0);
}

function createHost(
    files: Record<string, string>,
    themeName = "Test Theme",
    options?: { themeKind?: "dark" | "light"; baseTokenThemePath?: string },
): HighlightingHost {
    return {
        getGrammars: () => [
            { language: "testlang", scopeName: "source.testlang", path: "/grammars/testlang.json" },
        ],
        getLanguages: () => [{ id: "testlang", aliases: ["test"] }],
        getThemes: () => [{ label: "Test Theme", path: "/themes/test.json" }],
        getActiveThemeName: () => themeName,
        getThemeKind: () => options?.themeKind ?? "dark",
        getBaseTokenThemePath: () => options?.baseTokenThemePath,
        getTokenColorCustomizations: () => [],
        readFile: async (absolutePath) => {
            const content = files[absolutePath];
            if (content === undefined) {
                throw new Error(`Missing fixture ${absolutePath}`);
            }
            return content;
        },
    };
}

describe("syntaxHighlighting", () => {
    describe("unstyledHighlight", () => {
        it("covers the source with one default token", () => {
            const result = unstyledHighlight("abc");
            expect(result.tokens).toEqual([{ length: 3, foreground: 0, fontStyle: 0 }]);
        });

        it("returns no tokens for empty source", () => {
            expect(unstyledHighlight("").tokens).toEqual([]);
        });
    });

    describe("forEachSourceLine", () => {
        it("keeps Unix and Windows line breaks", () => {
            const lines: [string, string][] = [];
            forEachSourceLine("a\nb\r\nc", (line, lineBreak) => lines.push([line, lineBreak]));
            expect(lines).toEqual([
                ["a", "\n"],
                ["b", "\r\n"],
                ["c", ""],
            ]);
        });

        it("keeps a trailing newline", () => {
            const lines: [string, string][] = [];
            forEachSourceLine("a\n", (line, lineBreak) => lines.push([line, lineBreak]));
            expect(lines).toEqual([["a", "\n"]]);
        });
    });

    describe("metadata decode", () => {
        it("reads foreground and font style from encoded tokens", () => {
            const metadata = (7 << 15) | (1 << 11);
            expect(foregroundFromMetadata(metadata)).toBe(7);
            expect(fontStyleFromMetadata(metadata)).toBe(1);
        });

        it("treats unset font style as none", () => {
            expect(fontStyleFromMetadata(0b1111 << 11)).toBe(0);
        });
    });

    describe("resolveLanguageId", () => {
        const languages = [{ id: "typescript", aliases: ["ts", "TypeScript"] }];

        it("maps an alias to the language id", () => {
            expect(resolveLanguageId("ts", languages)).toBe("typescript");
            expect(resolveLanguageId("TypeScript", languages)).toBe("typescript");
        });

        it("maps common fence aliases when the language list is empty", () => {
            expect(resolveLanguageId("ts", [])).toBe("typescript");
            expect(resolveLanguageId("js", [])).toBe("javascript");
        });

        it("returns the trimmed needle when no language matches", () => {
            expect(resolveLanguageId(" rust ", languages)).toBe("rust");
        });
    });

    describe("findTheme", () => {
        const themes = [
            { id: "Default Dark Modern", label: "Default Dark Modern", path: "/themes/dark.json" },
        ];

        it("matches the theme id without case sensitivity", () => {
            expect(findTheme(themes, "default dark modern")?.path).toBe("/themes/dark.json");
        });

        it("matches a Cursor theme by file slug", () => {
            const cursor = [{
                label: "Cursor Dark Midnight",
                path: "/ext/themes/cursor-dark-midnight-color-theme.json",
            }];
            expect(findTheme(cursor, "Cursor Dark Midnight")?.label).toBe("Cursor Dark Midnight");
        });
    });

    describe("parseThemeDocument", () => {
        it("keeps token colors from minified JSON", () => {
            const parsed = parseThemeDocument(
                `{"name":"Cursor Dark Midnight v0.0.1","colors":{"editor.foreground":"#7b88a1"},"tokenColors":[{"scope":"keyword","settings":{"foreground":"#81A1C1"}}]}`,
            );
            expect(parsed.colors?.["editor.foreground"]).toBe("#7b88a1");
            expect(Array.isArray(parsed.tokenColors) && parsed.tokenColors).toHaveLength(1);
        });
    });

    describe("tokenColorCustomizationsToSettings", () => {
        it("maps group keys and theme-specific textMateRules", () => {
            const settings = tokenColorCustomizationsToSettings({
                keywords: "#ff00ff",
                "[Cursor Dark Midnight]": {
                    textMateRules: [{ scope: "string", settings: { foreground: "#00ff00" } }],
                },
            }, "Cursor Dark Midnight");
            expect(settings).toEqual([
                { scope: "keyword", settings: { foreground: "#ff00ff" } },
                { scope: "string", settings: { foreground: "#00ff00" } },
            ]);
        });
    });

    describe("parseJsonc", () => {
        it("keeps JSON objects with comments and a trailing comma", () => {
            const value = parseJsonc(`{
                // line comment
                "editor.foreground": "#aabbcc", /* block */
                "editor.background": "#111111",
            }`);
            expect(value).toEqual({
                "editor.foreground": "#aabbcc",
                "editor.background": "#111111",
            });
        });

        it("does not treat comment markers inside strings as comments", () => {
            const value = parseJsonc(`{ "label": "a // b /* c */" }`);
            expect(value).toEqual({ label: "a // b /* c */" });
        });
    });

    describe("loadRawTheme", () => {
        it("merges include files then overlay colors", async () => {
            const host = createHost({
                "/themes/base.json": JSON.stringify({
                    colors: { "editor.foreground": "#111111", "editor.background": "#000000" },
                    tokenColors: [{ scope: "comment", settings: { foreground: "#888888" } }],
                }),
                "/themes/test.json": JSON.stringify({
                    include: "./base.json",
                    colors: { "editor.foreground": "#aabbcc" },
                    tokenColors: [{ scope: "keyword", settings: { foreground: "#ff0000" } }],
                }),
            });
            const theme = await loadRawTheme(host, "/themes/test.json");
            expect(theme.settings[0]?.settings.foreground).toBe("#aabbcc");
            expect(theme.settings[0]?.settings.background).toBe("#000000");
            expect(theme.settings.some((setting) => setting.scope === "comment")).toBe(true);
            expect(theme.settings.some((setting) => setting.scope === "keyword")).toBe(true);
        });

        it("uses a visible dark fallback when editor.foreground is missing", async () => {
            const host = createHost({
                "/themes/test.json": JSON.stringify({
                    tokenColors: [{ scope: "keyword", settings: { foreground: "#ff0000" } }],
                }),
            });
            const theme = await loadRawTheme(host, "/themes/test.json", "dark");
            expect(theme.settings[0]?.settings.foreground).toBe("#cccccc");
        });
    });

    describe("toWebviewColorMap", () => {
        it("maps TextMate black to the editor foreground on dark themes", () => {
            expect(toWebviewColorMap(["", "#000000", "#FF0000"], "dark")).toEqual([
                "",
                "var(--vscode-editor-foreground)",
                "#FF0000",
            ]);
        });

        it("keeps black on light themes", () => {
            expect(toWebviewColorMap(["", "#000000"], "light")).toEqual(["", "#000000"]);
        });
    });

    describe("hasScopedTokenColors", () => {
        it("is false when only the default setting is present", () => {
            expect(hasScopedTokenColors([{ settings: { foreground: "#cccccc" } }])).toBe(false);
        });
    });

    describe("TextMateHighlighter", () => {
        it("colors tokens from the inherited theme", async () => {
            const highlighter = new TextMateHighlighter(
                WASM_PATH,
                createHost({
                    "/grammars/testlang.json": TEST_GRAMMAR,
                    "/themes/test.json": TEST_THEME,
                }),
            );
            const source = "hello world";
            const result = await highlighter.highlight(source, "test");
            expect(tokenLength(result.tokens)).toBe(source.length);

            const colored = result.tokens.filter((token) => token.foreground > 0);
            const colors = colored.map((token) => result.colorMap[token.foreground]?.toLowerCase());
            expect(colors).toContain("#ff0000");
            expect(colors).toContain("#00ff00");
        });

        it("returns one unstyled run when the language is unknown", async () => {
            const highlighter = new TextMateHighlighter(
                WASM_PATH,
                createHost({
                    "/grammars/testlang.json": TEST_GRAMMAR,
                    "/themes/test.json": TEST_THEME,
                }),
            );
            const source = "hello world";
            const result = await highlighter.highlight(source, "missing");
            expect(result.tokens).toEqual([{ length: source.length, foreground: 0, fontStyle: 0 }]);
        });

        it("uses base token colors when the active theme has none", async () => {
            const highlighter = new TextMateHighlighter(
                WASM_PATH,
                createHost(
                    {
                        "/grammars/testlang.json": TEST_GRAMMAR,
                        "/themes/test.json": JSON.stringify({ colors: { "editor.foreground": "#cccccc" } }),
                        "/themes/base.json": TEST_THEME,
                    },
                    "Test Theme",
                    { baseTokenThemePath: "/themes/base.json" },
                ),
            );
            const source = "hello world";
            const result = await highlighter.highlight(source, "test");
            const colors = result.tokens
                .filter((token) => token.foreground > 0)
                .map((token) => result.colorMap[token.foreground]?.toLowerCase());
            expect(colors).toContain("#ff0000");
            expect(colors).toContain("#00ff00");
        });

        it("uses token colors from a minified Cursor theme", async () => {
            const highlighter = new TextMateHighlighter(
                WASM_PATH,
                createHost({
                    "/grammars/testlang.json": TEST_GRAMMAR,
                    "/themes/test.json": `{"name":"Cursor Dark Midnight","colors":{"editor.foreground":"#7b88a1","editor.background":"#1e2127"},"tokenColors":[{"scope":"keyword.testlang","settings":{"foreground":"#81A1C1"}},{"scope":"string.testlang","settings":{"foreground":"#A3BE8C"}}]}`,
                }),
            );
            const result = await highlighter.highlight("hello world", "test");
            const colors = result.tokens
                .filter((token) => token.foreground > 0)
                .map((token) => result.colorMap[token.foreground]?.toLowerCase());
            expect(colors).toContain("#81a1c1");
            expect(colors).toContain("#a3be8c");
        });
    });
});
