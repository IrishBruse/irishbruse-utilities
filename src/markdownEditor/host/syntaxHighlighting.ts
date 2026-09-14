import { readdirSync, readFileSync } from "fs";
import { readFile } from "fs/promises";
import { dirname, join } from "path";
import { ColorThemeKind, env, extensions, window, workspace } from "vscode";
import {
    INITIAL,
    Registry,
    parseRawGrammar,
    type IGrammar,
    type IOnigLib,
    type IRawGrammar,
    type IRawTheme,
} from "vscode-textmate";
import { OnigScanner, OnigString, loadWASM } from "vscode-oniguruma";

/**
 * A coloured run as consumed by the markdown editor webview highlighter.
 * Tokens are dense: `sum(length)` equals the source length.
 */
export interface SyntaxHighlightingToken {
    readonly length: number;
    readonly foreground: number;
    readonly fontStyle: number;
}

export interface SyntaxHighlightingResult {
    readonly tokens: readonly SyntaxHighlightingToken[];
    readonly colorMap: readonly string[];
}

export interface GrammarContribution {
    readonly language?: string;
    readonly scopeName: string;
    readonly path: string;
    readonly injectTo?: readonly string[];
}

export interface LanguageContribution {
    readonly id: string;
    readonly aliases?: readonly string[];
}

export interface ThemeContribution {
    readonly id?: string;
    readonly label: string;
    readonly path: string;
}

export type ThemeKind = "dark" | "light";

type ThemeSetting = IRawTheme["settings"][number];

export interface HighlightingHost {
    getGrammars(): readonly GrammarContribution[];
    getLanguages(): readonly LanguageContribution[];
    getThemes(): readonly ThemeContribution[];
    getActiveThemeName(): string;
    getThemeKind(): ThemeKind;
    getBaseTokenThemePath(kind: ThemeKind): string | undefined;
    getTokenColorCustomizations(themeName: string): readonly ThemeSetting[];
    readFile(absolutePath: string): Promise<string>;
}

type VsCodeThemeFile = {
    name?: string;
    include?: string;
    colors?: Record<string, string>;
    tokenColors?: string | ThemeSetting[];
};

const FONT_STYLE_OFFSET = 11;
const FOREGROUND_OFFSET = 15;
const FONT_STYLE_MASK = 0b1111 << FONT_STYLE_OFFSET;
const FOREGROUND_MASK = 0b1_1111_1111 << FOREGROUND_OFFSET;
const FONT_STYLE_NOT_SET = 0b1111;

const FALLBACK_THEME: IRawTheme = {
    name: "fallback",
    settings: [{ settings: { foreground: "#cccccc", background: "#1e1e1e" } }],
};

let defaultHighlighter: TextMateHighlighter | undefined;

export function configureMarkdownSyntaxHighlighting(extensionPath: string): void {
    defaultHighlighter = new TextMateHighlighter(join(extensionPath, "dist", "onig.wasm"), createVsCodeHighlightingHost());
}

export async function highlightMarkdownCode(source: string, languageId: string): Promise<SyntaxHighlightingResult> {
    if (!defaultHighlighter) {
        return unstyledHighlight(source);
    }
    try {
        return await defaultHighlighter.highlight(source, languageId);
    } catch {
        return unstyledHighlight(source);
    }
}

export function invalidateMarkdownSyntaxTheme(): void {
    defaultHighlighter?.invalidateTheme();
}

export function unstyledHighlight(source: string): SyntaxHighlightingResult {
    return {
        tokens: source.length > 0 ? [{ length: source.length, foreground: 0, fontStyle: 0 }] : [],
        colorMap: [""],
    };
}

export function foregroundFromMetadata(metadata: number): number {
    return (metadata & FOREGROUND_MASK) >>> FOREGROUND_OFFSET;
}

export function fontStyleFromMetadata(metadata: number): number {
    const fontStyle = (metadata & FONT_STYLE_MASK) >>> FONT_STYLE_OFFSET;
    return fontStyle === FONT_STYLE_NOT_SET ? 0 : fontStyle;
}

const FENCE_LANGUAGE_ALIASES: Record<string, string> = {
    ts: "typescript",
    tsx: "typescriptreact",
    js: "javascript",
    jsx: "javascriptreact",
    mjs: "javascript",
    cjs: "javascript",
    py: "python",
    sh: "shellscript",
    bash: "shellscript",
    zsh: "shellscript",
    shell: "shellscript",
    yml: "yaml",
    md: "markdown",
};

export function resolveLanguageId(languageId: string, languages: readonly LanguageContribution[]): string {
    const trimmed = languageId.trim().toLowerCase();
    if (!trimmed) {
        return "";
    }
    const needle = FENCE_LANGUAGE_ALIASES[trimmed] ?? trimmed;
    for (const language of languages) {
        if (language.id.toLowerCase() === needle) {
            return language.id;
        }
        for (const alias of language.aliases ?? []) {
            if (alias.toLowerCase() === needle) {
                return language.id;
            }
        }
    }
    return needle;
}

export function findTheme(
    themes: readonly ThemeContribution[],
    themeName: string,
): ThemeContribution | undefined {
    if (!themeName) {
        return undefined;
    }
    const exact = themes.find(
        (candidate) => candidate.label === themeName || candidate.id === themeName,
    );
    if (exact) {
        return exact;
    }
    const lower = themeName.toLowerCase();
    const caseInsensitive = themes.find(
        (candidate) =>
            candidate.label.toLowerCase() === lower || candidate.id?.toLowerCase() === lower,
    );
    if (caseInsensitive) {
        return caseInsensitive;
    }
    const slug = themeSlug(themeName);
    return themes.find((candidate) => {
        const idSlug = candidate.id ? themeSlug(candidate.id) : "";
        const labelSlug = themeSlug(candidate.label);
        return idSlug === slug
            || labelSlug === slug
            || themeSlug(candidate.path).includes(slug);
    });
}

function themeSlug(value: string): string {
    return value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
}

export function forEachSourceLine(source: string, onLine: (line: string, lineBreak: string) => void): void {
    let start = 0;
    for (let i = 0; i < source.length; i++) {
        const code = source.charCodeAt(i);
        if (code !== 10 && code !== 13) {
            continue;
        }
        let breakEnd = i + 1;
        if (code === 13 && source.charCodeAt(breakEnd) === 10) {
            breakEnd = i + 2;
        }
        onLine(source.slice(start, i), source.slice(i, breakEnd));
        start = breakEnd;
        i = breakEnd - 1;
    }
    if (start < source.length) {
        onLine(source.slice(start), "");
    }
}

export function fallbackColors(kind: ThemeKind): { foreground: string; background: string } {
    return kind === "light"
        ? { foreground: "#333333", background: "#ffffff" }
        : { foreground: "#cccccc", background: "#1e1e1e" };
}

export function cssColor(value: unknown): string | undefined {
    if (typeof value !== "string") {
        return undefined;
    }
    const trimmed = value.trim();
    if (/^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/.test(trimmed)) {
        return trimmed;
    }
    if (/^(rgb|hsl)a?\(/i.test(trimmed)) {
        return trimmed;
    }
    return undefined;
}

export function hasScopedTokenColors(settings: readonly ThemeSetting[]): boolean {
    return settings.some((setting) => {
        const scope = setting.scope;
        return typeof scope === "string"
            ? scope.length > 0
            : Array.isArray(scope) && scope.length > 0;
    });
}

/**
 * Map TextMate default blacks (dark themes) and the theme's editor.foreground hex
 * onto the live webview editor foreground CSS variable.
 */
export function toWebviewColorMap(
    colorMap: readonly string[],
    kind: ThemeKind,
    editorForeground?: string,
): string[] {
    const editorFg = normalizeCssHex(editorForeground);
    return colorMap.map((color, index) => {
        if (index === 0 || !color) {
            return "";
        }
        if (kind === "dark" && isCssBlack(color)) {
            return "var(--vscode-editor-foreground)";
        }
        if (editorFg && normalizeCssHex(color) === editorFg) {
            return "var(--vscode-editor-foreground)";
        }
        return color;
    });
}

function isCssBlack(color: string): boolean {
    const value = color.trim().toLowerCase();
    return value === "#000" || value === "#000000" || value === "#000000ff";
}

function normalizeCssHex(color: string | undefined): string | undefined {
    if (!color) {
        return undefined;
    }
    const value = color.trim().toLowerCase();
    if (/^#[0-9a-f]{3}$/.test(value)) {
        return `#${value[1]}${value[1]}${value[2]}${value[2]}${value[3]}${value[3]}`;
    }
    if (/^#[0-9a-f]{6}$/.test(value)) {
        return value;
    }
    if (/^#[0-9a-f]{8}$/.test(value)) {
        return value.slice(0, 7);
    }
    return undefined;
}

export async function loadRawTheme(
    host: HighlightingHost,
    themePath: string,
    kind: ThemeKind = "dark",
): Promise<IRawTheme> {
    const loaded = await loadThemeFile(host, themePath);
    const fallback = fallbackColors(kind);
    const defaults: ThemeSetting = {
        settings: {
            foreground: cssColor(loaded.colors["editor.foreground"]) ?? fallback.foreground,
            background: cssColor(loaded.colors["editor.background"]) ?? fallback.background,
        },
    };
    return {
        name: loaded.name,
        settings: [defaults, ...loaded.settings],
    };
}

export class TextMateHighlighter {
    readonly #wasmPath: string;
    readonly #host: HighlightingHost;
    #onigLib: Promise<IOnigLib> | undefined;
    #registryReady: Promise<Registry> | undefined;
    #themeDirty = true;
    #editorForeground: string | undefined;
    #grammarPathByScope = new Map<string, string>();
    #scopeByLanguage = new Map<string, string>();
    #injections = new Map<string, string[]>();
    #languages: LanguageContribution[] = [];
    #themes: ThemeContribution[] = [];

    constructor(wasmPath: string, host: HighlightingHost) {
        this.#wasmPath = wasmPath;
        this.#host = host;
        this.#indexContributions();
    }

    invalidateTheme(): void {
        this.#themeDirty = true;
    }

    async highlight(source: string, languageId: string): Promise<SyntaxHighlightingResult> {
        if (source.length === 0) {
            return unstyledHighlight(source);
        }
        const registry = await this.#ensureRegistry();
        const scopeName = this.#scopeForLanguage(languageId);
        if (!scopeName) {
            return unstyledHighlight(source);
        }
        const grammar = await registry.loadGrammar(scopeName);
        if (!grammar) {
            return unstyledHighlight(source);
        }
        if (this.#themeDirty) {
            await this.#applyTheme(registry);
        }
        const result = tokenizeSource(grammar, registry.getColorMap(), source);
        return {
            tokens: result.tokens,
            colorMap: toWebviewColorMap(
                result.colorMap,
                this.#host.getThemeKind(),
                this.#editorForeground,
            ),
        };
    }

    #indexContributions(): void {
        this.#languages = [...this.#host.getLanguages()];
        this.#themes = [...this.#host.getThemes()];
        this.#grammarPathByScope.clear();
        this.#scopeByLanguage.clear();
        this.#injections.clear();
        for (const grammar of this.#host.getGrammars()) {
            this.#grammarPathByScope.set(grammar.scopeName, grammar.path);
            if (grammar.language) {
                this.#scopeByLanguage.set(grammar.language.toLowerCase(), grammar.scopeName);
            }
            for (const target of grammar.injectTo ?? []) {
                const list = this.#injections.get(target) ?? [];
                list.push(grammar.scopeName);
                this.#injections.set(target, list);
            }
        }
    }

    #scopeForLanguage(languageId: string): string | undefined {
        const resolved = resolveLanguageId(languageId, this.#languages);
        return resolved ? this.#scopeByLanguage.get(resolved.toLowerCase()) : undefined;
    }

    async #ensureRegistry(): Promise<Registry> {
        try {
            this.#registryReady ??= this.#createRegistry();
            return await this.#registryReady;
        } catch (error) {
            this.#registryReady = undefined;
            this.#onigLib = undefined;
            throw error;
        }
    }

    async #createRegistry(): Promise<Registry> {
        this.#onigLib ??= loadOnigLib(this.#wasmPath);
        const registry = new Registry({
            onigLib: this.#onigLib,
            loadGrammar: async (scopeName): Promise<IRawGrammar | null> => {
                const grammarPath = this.#grammarPathByScope.get(scopeName);
                if (!grammarPath) {
                    return null;
                }
                try {
                    const content = await this.#host.readFile(grammarPath);
                    return parseRawGrammar(content, grammarPath);
                } catch {
                    return null;
                }
            },
            getInjections: (scopeName) => this.#injections.get(scopeName),
        });
        await this.#applyTheme(registry);
        return registry;
    }

    async #applyTheme(registry: Registry): Promise<void> {
        registry.setTheme(await this.#loadActiveTheme());
        this.#themeDirty = false;
    }

    async #loadActiveTheme(): Promise<IRawTheme> {
        this.#indexContributions();
        const kind = this.#host.getThemeKind();
        const fallback = fallbackColors(kind);
        const themeName = this.#host.getActiveThemeName();
        const theme = findTheme(this.#themes, themeName);
        let colors: Record<string, string> = {};
        let settings: ThemeSetting[] = [];
        let name = FALLBACK_THEME.name;
        if (theme) {
            try {
                const loaded = await loadThemeFile(this.#host, theme.path);
                colors = loaded.colors;
                settings = [...loaded.settings];
                name = loaded.name ?? theme.label;
            } catch {
                // Keep empty settings and use Dark+/Light+ plus fallbacks below.
            }
        }
        if (!hasScopedTokenColors(settings)) {
            const basePath = this.#host.getBaseTokenThemePath(kind);
            if (basePath) {
                try {
                    const base = await loadThemeFile(this.#host, basePath);
                    colors = { ...base.colors, ...colors };
                    settings = [...base.settings, ...settings];
                } catch {
                    // Keep the active theme when the Dark+/Light+ base file is missing.
                }
            }
        }
        settings = [...settings, ...this.#host.getTokenColorCustomizations(themeName)];
        const foreground = cssColor(colors["editor.foreground"]) ?? fallback.foreground;
        this.#editorForeground = foreground;
        return {
            name,
            settings: [
                {
                    settings: {
                        foreground,
                        background: cssColor(colors["editor.background"]) ?? fallback.background,
                    },
                },
                ...settings,
            ],
        };
    }
}

export function tokenizeSource(
    grammar: IGrammar,
    colorMap: readonly string[],
    source: string,
): SyntaxHighlightingResult {
    const tokens: SyntaxHighlightingToken[] = [];
    let ruleStack = INITIAL;
    forEachSourceLine(source, (line, lineBreak) => {
        const result = grammar.tokenizeLine2(line, ruleStack);
        ruleStack = result.ruleStack;
        appendEncodedLineTokens(tokens, line, result.tokens);
        if (lineBreak.length > 0) {
            tokens.push({ length: lineBreak.length, foreground: 0, fontStyle: 0 });
        }
    });
    return {
        tokens,
        colorMap: colorMap.map((color) => color ?? ""),
    };
}

function appendEncodedLineTokens(tokens: SyntaxHighlightingToken[], line: string, encoded: Uint32Array): void {
    const count = encoded.length >>> 1;
    let covered = 0;
    for (let i = 0; i < count; i++) {
        const start = encoded[i * 2];
        const metadata = encoded[i * 2 + 1];
        const end = i + 1 < count ? encoded[(i + 1) * 2] : line.length;
        const length = end - start;
        if (length <= 0) {
            continue;
        }
        tokens.push({
            length,
            foreground: foregroundFromMetadata(metadata),
            fontStyle: fontStyleFromMetadata(metadata),
        });
        covered = end;
    }
    if (covered < line.length) {
        tokens.push({ length: line.length - covered, foreground: 0, fontStyle: 0 });
    }
}

async function loadOnigLib(wasmPath: string): Promise<IOnigLib> {
    const wasm = await readFile(wasmPath);
    await loadWASM(wasm);
    return {
        createOnigScanner: (patterns) => new OnigScanner(patterns),
        createOnigString: (value) => new OnigString(value),
    };
}

export function parseThemeDocument(text: string): VsCodeThemeFile {
    const trimmed = text.replace(/^\uFEFF/, "");
    try {
        return JSON.parse(trimmed) as VsCodeThemeFile;
    } catch {
        return parseJsonc(trimmed) as VsCodeThemeFile;
    }
}

const TOKEN_COLOR_GROUPS: ReadonlyArray<readonly [string, string]> = [
    ["comments", "comment"],
    ["functions", "entity.name.function"],
    ["keywords", "keyword"],
    ["numbers", "constant.numeric"],
    ["strings", "string"],
    ["types", "entity.name.type"],
    ["variables", "variable"],
];

export function tokenColorCustomizationsToSettings(
    raw: unknown,
    themeName: string,
): ThemeSetting[] {
    if (!raw || typeof raw !== "object") {
        return [];
    }
    const root = raw as Record<string, unknown>;
    return [
        ...settingsFromCustomizationGroup(root),
        ...settingsFromCustomizationGroup(root[`[${themeName}]`]),
    ];
}

function settingsFromCustomizationGroup(value: unknown): ThemeSetting[] {
    if (!value || typeof value !== "object") {
        return [];
    }
    const group = value as Record<string, unknown>;
    const settings: ThemeSetting[] = [];
    for (const [key, scope] of TOKEN_COLOR_GROUPS) {
        const color = cssColor(group[key]);
        if (color) {
            settings.push({ scope, settings: { foreground: color } });
        }
    }
    if (Array.isArray(group.textMateRules)) {
        settings.push(...group.textMateRules.filter(isThemeSetting));
    }
    return settings;
}

export function parseJsonc(text: string): unknown {
    return JSON.parse(stripJsonc(text));
}

/** Strip comments and trailing commas. Keep string contents unchanged. */
export function stripJsonc(text: string): string {
    let result = "";
    let i = 0;
    while (i < text.length) {
        const current = text[i];
        const next = text[i + 1];
        if (current === '"') {
            const copied = copyJsonString(text, i);
            result += copied.value;
            i = copied.end;
            continue;
        }
        if (current === "/" && next === "/") {
            i = skipUntil(text, i + 2, (code) => code === 10 || code === 13);
            continue;
        }
        if (current === "/" && next === "*") {
            const end = text.indexOf("*/", i + 2);
            i = end === -1 ? text.length : end + 2;
            continue;
        }
        if (current === ",") {
            const after = peekNonWhitespace(text, i + 1);
            if (after === "}" || after === "]") {
                i += 1;
                continue;
            }
        }
        result += current;
        i += 1;
    }
    return result;
}

function copyJsonString(text: string, start: number): { value: string; end: number } {
    let value = '"';
    let i = start + 1;
    while (i < text.length) {
        const current = text[i];
        value += current;
        if (current === "\\") {
            if (i + 1 < text.length) {
                value += text[i + 1];
                i += 2;
                continue;
            }
        } else if (current === '"') {
            return { value, end: i + 1 };
        }
        i += 1;
    }
    return { value, end: i };
}

function skipUntil(text: string, start: number, stop: (code: number) => boolean): number {
    let i = start;
    while (i < text.length && !stop(text.charCodeAt(i))) {
        i += 1;
    }
    return i;
}

function peekNonWhitespace(text: string, start: number): string | undefined {
    let i = start;
    while (i < text.length) {
        const current = text[i];
        const next = text[i + 1];
        if (current === "/" && next === "/") {
            i = skipUntil(text, i + 2, (code) => code === 10 || code === 13);
            continue;
        }
        if (current === "/" && next === "*") {
            const end = text.indexOf("*/", i + 2);
            i = end === -1 ? text.length : end + 2;
            continue;
        }
        if (current === " " || current === "\t" || current === "\n" || current === "\r") {
            i += 1;
            continue;
        }
        return current;
    }
    return undefined;
}

async function loadThemeFile(
    host: HighlightingHost,
    themePath: string,
): Promise<{ name?: string; colors: Record<string, string>; settings: ThemeSetting[] }> {
    const raw = parseThemeDocument(await host.readFile(themePath));
    let colors: Record<string, string> = {};
    let settings: ThemeSetting[] = [];
    if (typeof raw.include === "string" && raw.include.length > 0) {
        try {
            const included = await loadThemeFile(
                host,
                await resolveThemeInclude(host, themePath, raw.include),
            );
            colors = included.colors;
            settings = included.settings;
        } catch {
            // Keep this file's colors when the include path is missing.
        }
    }
    if (raw.colors && typeof raw.colors === "object") {
        for (const [key, value] of Object.entries(raw.colors)) {
            if (typeof value === "string") {
                colors[key] = value;
            }
        }
    }
    const tokenColors = await resolveTokenColors(host, themePath, raw.tokenColors);
    return {
        name: typeof raw.name === "string" ? raw.name : undefined,
        colors,
        settings: [...settings, ...tokenColors],
    };
}

async function resolveTokenColors(
    host: HighlightingHost,
    themePath: string,
    tokenColors: VsCodeThemeFile["tokenColors"],
): Promise<ThemeSetting[]> {
    if (typeof tokenColors === "string" && tokenColors.length > 0) {
        const included = await loadThemeFile(
            host,
            await resolveThemeInclude(host, themePath, tokenColors),
        );
        return included.settings;
    }
    if (!Array.isArray(tokenColors)) {
        return [];
    }
    return tokenColors.filter(isThemeSetting);
}

function isThemeSetting(value: unknown): value is ThemeSetting {
    if (!value || typeof value !== "object" || !("settings" in value)) {
        return false;
    }
    const settings = (value as { settings: unknown }).settings;
    return typeof settings === "object" && settings !== null;
}

function createVsCodeHighlightingHost(): HighlightingHost {
    return {
        getGrammars: () => {
            const grammars: GrammarContribution[] = [];
            for (const extension of extensions.all) {
                const contributed = extension.packageJSON?.contributes?.grammars;
                if (!Array.isArray(contributed)) {
                    continue;
                }
                for (const grammar of contributed) {
                    if (typeof grammar?.scopeName !== "string" || typeof grammar?.path !== "string") {
                        continue;
                    }
                    grammars.push({
                        scopeName: grammar.scopeName,
                        path: join(extension.extensionPath, grammar.path),
                        language: typeof grammar.language === "string" ? grammar.language : undefined,
                        injectTo: Array.isArray(grammar.injectTo)
                            ? grammar.injectTo.filter((item: unknown) => typeof item === "string")
                            : undefined,
                    });
                }
            }
            return grammars;
        },
        getLanguages: () => {
            const languages: LanguageContribution[] = [];
            for (const extension of extensions.all) {
                const contributed = extension.packageJSON?.contributes?.languages;
                if (!Array.isArray(contributed)) {
                    continue;
                }
                for (const language of contributed) {
                    if (typeof language?.id !== "string") {
                        continue;
                    }
                    languages.push({
                        id: language.id,
                        aliases: Array.isArray(language.aliases)
                            ? language.aliases.filter((item: unknown) => typeof item === "string")
                            : [],
                    });
                }
            }
            return languages;
        },
        getThemes: () => collectThemeContributions(),
        getActiveThemeName: () => readActiveThemeName(),
        getThemeKind: () => {
            const kind = window.activeColorTheme?.kind;
            return kind === ColorThemeKind.Light || kind === ColorThemeKind.HighContrastLight
                ? "light"
                : "dark";
        },
        getBaseTokenThemePath: (kind) => {
            const suffix = kind === "light" ? "/light_plus.json" : "/dark_plus.json";
            const alt = kind === "light" ? "/light_vs.json" : "/dark_vs.json";
            const themes = collectThemeContributions();
            return themes.find((theme) => themePathEndsWith(theme.path, suffix))?.path
                ?? themes.find((theme) => themePathEndsWith(theme.path, alt))?.path;
        },
        getTokenColorCustomizations: (themeName) => {
            return tokenColorCustomizationsToSettings(
                workspace.getConfiguration("editor").get("tokenColorCustomizations"),
                themeName,
            );
        },
        readFile: (absolutePath) => readFile(absolutePath, "utf8"),
    };
}

function collectThemeContributions(): ThemeContribution[] {
    const themes: ThemeContribution[] = [];
    const seen = new Set<string>();
    const add = (theme: ThemeContribution): void => {
        const key = theme.path.replaceAll("\\", "/").toLowerCase();
        if (seen.has(key)) {
            return;
        }
        seen.add(key);
        themes.push(theme);
    };
    for (const extension of extensions.all) {
        collectThemesFromPackage(extension.packageJSON, extension.extensionPath, add);
    }
    collectThemesFromAppRoot(add);
    return themes;
}

function collectThemesFromAppRoot(add: (theme: ThemeContribution) => void): void {
    const appRoot = env.appRoot;
    if (typeof appRoot !== "string" || appRoot.length === 0) {
        return;
    }
    const extensionsDir = join(appRoot, "extensions");
    let names: string[];
    try {
        names = readdirSync(extensionsDir);
    } catch {
        return;
    }
    for (const name of names) {
        const extensionPath = join(extensionsDir, name);
        try {
            const pkg = JSON.parse(readFileSync(join(extensionPath, "package.json"), "utf8"));
            collectThemesFromPackage(pkg, extensionPath, add);
        } catch {
            continue;
        }
    }
}

function collectThemesFromPackage(
    packageJson: unknown,
    extensionPath: string,
    add: (theme: ThemeContribution) => void,
): void {
    const contributed = (packageJson as { contributes?: { themes?: unknown } } | undefined)
        ?.contributes
        ?.themes;
    if (!Array.isArray(contributed)) {
        return;
    }
    for (const theme of contributed) {
        if (typeof theme?.path !== "string") {
            continue;
        }
        const label = typeof theme.label === "string"
            ? theme.label
            : typeof theme.id === "string"
                ? theme.id
                : undefined;
        if (!label) {
            continue;
        }
        add({
            id: typeof theme.id === "string" ? theme.id : undefined,
            label,
            path: join(extensionPath, theme.path),
        });
    }
}

function readActiveThemeName(): string {
    const config = workspace.getConfiguration("workbench");
    const value = config.get<unknown>("colorTheme");
    if (typeof value === "string" && value.length > 0) {
        return value;
    }
    const inspected = config.inspect<unknown>("colorTheme");
    for (const candidate of [
        inspected?.workspaceFolderValue,
        inspected?.workspaceValue,
        inspected?.globalValue,
        inspected?.defaultValue,
    ]) {
        if (typeof candidate === "string" && candidate.length > 0) {
            return candidate;
        }
    }
    return "";
}

async function resolveThemeInclude(
    host: HighlightingHost,
    fromPath: string,
    include: string,
): Promise<string> {
    const relative = join(dirname(fromPath), include);
    try {
        await host.readFile(relative);
        return relative;
    } catch {
        const theme = findTheme(host.getThemes(), include);
        if (theme) {
            return theme.path;
        }
        throw new Error(`Missing theme include ${include}`);
    }
}

function themePathEndsWith(themePath: string, suffix: string): boolean {
    return themePath.replaceAll("\\", "/").toLowerCase().endsWith(suffix);
}
