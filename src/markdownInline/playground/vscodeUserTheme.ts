import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";


export type VscodeThemeBodyClass =
    | "vscode-dark"
    | "vscode-light"
    | "vscode-high-contrast"
    | "vscode-high-contrast-light";

export interface VscodeUserTheme {
    readonly css: string;
    readonly bodyClass: VscodeThemeBodyClass;
}

const FALLBACK_THEME: VscodeUserTheme = { css: "", bodyClass: "vscode-dark" };

const PLAYGROUND_THEME_SCOPE = ":root, .inline-md-root, .inline-md-root .monaco-editor";

const MARKDOWN_COLOR_VARS: Readonly<Record<string, string>> = {
    heading1: "--ib-md-heading-1",
    heading2: "--ib-md-heading-2",
    heading3: "--ib-md-heading-3",
    heading4: "--ib-md-heading-4",
    heading5: "--ib-md-heading-5",
    heading6: "--ib-md-heading-6",
    inlineCode: "--ib-md-inline-code",
    inlineCodeBackground: "--ib-md-inline-code-background",
};

const GENERIC_FONT_FAMILIES = new Set([
    "serif",
    "sans-serif",
    "monospace",
    "cursive",
    "fantasy",
    "system-ui",
    "ui-monospace",
    "ui-serif",
    "ui-sans-serif",
    "emoji",
    "math",
    "fangsong",
]);

export interface VscodeSettingsLocation {
    readonly home: string;
    readonly platform: NodeJS.Platform;
    readonly xdgConfigHome?: string;
    readonly appData?: string;
}


export function vscodeUserSettingsPath(location?: VscodeSettingsLocation): string {
    const home = location?.home ?? homedir();
    const platform = location?.platform ?? process.platform;
    if (platform === "darwin") {
        return join(home, "Library", "Application Support", "Code", "User", "settings.json");
    }
    if (platform === "win32") {
        const appData = location?.appData ?? process.env.APPDATA ?? join(home, "AppData", "Roaming");
        return join(appData, "Code", "User", "settings.json");
    }
    const configHome = location?.xdgConfigHome ?? process.env.XDG_CONFIG_HOME ?? join(home, ".config");
    return join(configHome, "Code", "User", "settings.json");
}


export function parseSettingsJsonc(text: string): Record<string, unknown> {
    const parsed: unknown = JSON.parse(stripJsonc(text));
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
        throw new Error("VS Code settings.json must be a JSON object");
    }
    return parsed as Record<string, unknown>;
}


export function vscodeUserThemeFromSettings(settings: Record<string, unknown>): VscodeUserTheme {
    const themeName = readString(settings, "workbench.colorTheme");
    const bodyClass = themeBodyClass(themeName);
    const declarations = [
        ...workbenchColorDeclarations(settings, themeName),
        ...markdownColorDeclarations(settings),
        ...fontDeclarations(settings),
    ];
    return {
        css: formatPlaygroundThemeCss(bodyClass, declarations, readBoolean(settings, "editor.fontLigatures") === true),
        bodyClass,
    };
}


export function parseIframeInjectedThemeHtml(html: string): string[] {
    const match = html.match(/<html[^>]*\sstyle="([\s\S]*?)"\s*>/i);
    if (!match) {
        return [];
    }
    const decoded = match[1]
        .replaceAll("&quot;", "\"")
        .replaceAll("&amp;", "&")
        .replaceAll("&lt;", "<")
        .replaceAll("&gt;", ">");
    const declarations: string[] = [];
    for (const line of decoded.split("\n")) {
        const trimmed = line.trim();
        if (!trimmed.startsWith("--")) {
            continue;
        }
        declarations.push(trimmed.endsWith(";") ? trimmed : `${trimmed};`);
    }
    return declarations;
}

export interface ReadPlaygroundThemeOptions {
    readonly settingsPath?: string;
}


export function readPlaygroundTheme(options: ReadPlaygroundThemeOptions = {}): VscodeUserTheme {
    const settingsPath = options.settingsPath ?? vscodeUserSettingsPath();
    let text: string;
    try {
        text = readFileSync(settingsPath, "utf8");
    } catch {
        return FALLBACK_THEME;
    }
    try {
        return vscodeUserThemeFromSettings(parseSettingsJsonc(text));
    } catch {
        return FALLBACK_THEME;
    }
}


export function readVscodeUserTheme(settingsPath = vscodeUserSettingsPath()): VscodeUserTheme {
    return readPlaygroundTheme({ settingsPath });
}

function formatPlaygroundThemeCss(
    bodyClass: VscodeThemeBodyClass,
    declarations: string[],
    fontLigatures: boolean,
): string {
    if (declarations.length === 0 && !fontLigatures) {
        return "";
    }
    const lines = [
        `${PLAYGROUND_THEME_SCOPE} {`,
        `    color-scheme: ${bodyClass === "vscode-light" || bodyClass === "vscode-high-contrast-light" ? "light" : "dark"};`,
        ...declarations.map((declaration) => `    ${declaration}`),
        "}",
    ];
    if (fontLigatures) {
        lines.push(".md-editor {", "    font-variant-ligatures: common-ligatures;", "}");
    }
    return lines.join("\n");
}


export function colorIdToCssVariable(colorId: string): string {
    return `--vscode-${colorId.replaceAll(".", "-")}`;
}

function collectWorkbenchColors(settings: Record<string, unknown>, themeName: string | undefined): Map<string, string> {
    const raw = settings["workbench.colorCustomizations"];
    if (!isRecord(raw)) {
        return new Map();
    }
    const colors = new Map<string, string>();
    for (const [key, value] of Object.entries(raw)) {
        if (key.startsWith("[")) {
            continue;
        }
        const color = cssColorValue(value);
        if (color && isColorId(key)) {
            colors.set(key, color);
        }
    }
    if (themeName) {
        const scoped = raw[`[${themeName}]`];
        if (isRecord(scoped)) {
            for (const [key, value] of Object.entries(scoped)) {
                const color = cssColorValue(value);
                if (color && isColorId(key)) {
                    colors.set(key, color);
                }
            }
        }
    }
    return colors;
}

function derivePlaygroundWorkbenchColors(colors: Map<string, string>): void {
    const dropdownBackground = colors.get("dropdown.background");
    if (!colors.has("checkbox.background") && dropdownBackground) {
        colors.set("checkbox.background", dropdownBackground);
    }
    const dropdownBorder = colors.get("dropdown.border");
    if (!colors.has("checkbox.border") && dropdownBorder) {
        colors.set("checkbox.border", dropdownBorder);
    }
    const dropdownForeground = colors.get("dropdown.foreground");
    if (!colors.has("checkbox.foreground") && dropdownForeground) {
        colors.set("checkbox.foreground", dropdownForeground);
    }
    const focusBorder = colors.get("focusBorder");
    if (!colors.has("inputOption.activeBorder") && focusBorder) {
        colors.set("inputOption.activeBorder", focusBorder);
    }
}

function workbenchColorDeclarations(settings: Record<string, unknown>, themeName: string | undefined): string[] {
    const colors = collectWorkbenchColors(settings, themeName);
    derivePlaygroundWorkbenchColors(colors);
    return [...colors.entries()]
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([colorId, color]) => `${colorIdToCssVariable(colorId)}: ${color};`);
}

function markdownColorDeclarations(settings: Record<string, unknown>): string[] {
    const nested = settings["markdownInlineEditor.colors"];
    const nestedColors = isRecord(nested) ? nested : {};
    const declarations: string[] = [];
    for (const [key, cssVariable] of Object.entries(MARKDOWN_COLOR_VARS)) {
        const flat = cssColorValue(settings[`markdownInlineEditor.colors.${key}`]);
        const color = flat ?? cssColorValue(nestedColors[key]);
        if (color) {
            declarations.push(`${cssVariable}: ${color};`);
        }
    }
    return declarations;
}

function fontDeclarations(settings: Record<string, unknown>): string[] {
    const editorFamily = fontFamilyCss(readString(settings, "editor.fontFamily"));
    const previewFamily = fontFamilyCss(readString(settings, "markdown.preview.fontFamily")) ?? editorFamily;
    const editorSize = fontSizeCss(settings["editor.fontSize"]);
    const previewSize = fontSizeCss(settings["markdown.preview.fontSize"]) ?? editorSize;
    const declarations: string[] = [];
    if (editorFamily) {
        declarations.push(`--vscode-editor-font-family: ${editorFamily};`);
    }
    if (editorSize) {
        declarations.push(`--vscode-editor-font-size: ${editorSize};`);
    }
    if (previewFamily) {
        declarations.push(`--markdown-font-family: ${previewFamily};`);
    }
    if (previewSize) {
        declarations.push(`--markdown-font-size: ${previewSize};`);
    }
    return declarations;
}

function themeBodyClass(themeName: string | undefined): VscodeThemeBodyClass {
    const name = themeName?.toLowerCase() ?? "";
    const highContrast = name.includes("high contrast");
    const light = name.includes("light");
    if (highContrast && light) {
        return "vscode-high-contrast-light";
    }
    if (highContrast) {
        return "vscode-high-contrast";
    }
    if (light) {
        return "vscode-light";
    }
    return "vscode-dark";
}

function cssColorValue(value: unknown): string | undefined {
    if (typeof value !== "string") {
        return undefined;
    }
    const trimmed = value.trim();
    if (/^#(?:[0-9a-fA-F]{3,4}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/.test(trimmed)) {
        return trimmed;
    }
    if (/^(?:rgb|hsl)a?\([\d\s.,%/+-]+\)$/i.test(trimmed)) {
        return trimmed;
    }
    return undefined;
}

function isColorId(value: string): boolean {
    return /^[A-Za-z][A-Za-z0-9]*(?:\.[A-Za-z][A-Za-z0-9]*)*$/.test(value);
}

function fontFamilyCss(value: string | undefined): string | undefined {
    if (!value) {
        return undefined;
    }
    const families = value
        .split(",")
        .map((part) => part.trim())
        .filter((part) => part.length > 0)
        .map((part) => {
            const lower = part.toLowerCase();
            if (GENERIC_FONT_FAMILIES.has(lower)) {
                return lower;
            }
            if (!/^[\w][\w .+-]*$/.test(part)) {
                return undefined;
            }
            return `"${part}"`;
        });
    if (families.some((family) => family === undefined)) {
        return undefined;
    }
    const quoted = families.filter((family): family is string => family !== undefined);
    return quoted.length > 0 ? quoted.join(", ") : undefined;
}

function fontSizeCss(value: unknown): string | undefined {
    if (typeof value === "number" && Number.isFinite(value) && value > 0 && value <= 200) {
        return `${value}px`;
    }
    if (typeof value === "string" && /^\d+(?:\.\d+)?(?:px|em|rem|%)$/.test(value.trim())) {
        return value.trim();
    }
    return undefined;
}

function readString(settings: Record<string, unknown>, key: string): string | undefined {
    const value = settings[key];
    return typeof value === "string" && value.trim().length > 0 ? value.trim() : undefined;
}

function readBoolean(settings: Record<string, unknown>, key: string): boolean | undefined {
    const value = settings[key];
    return typeof value === "boolean" ? value : undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return !!value && typeof value === "object" && !Array.isArray(value);
}

function stripJsonc(text: string): string {
    let out = "";
    let index = 0;
    const source = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
    while (index < source.length) {
        const char = source[index];
        if (char === '"') {
            const end = readJsonStringEnd(source, index);
            out += source.slice(index, end);
            index = end;
            continue;
        }
        if (char === "/" && source[index + 1] === "/") {
            const newline = source.indexOf("\n", index);
            index = newline < 0 ? source.length : newline;
            continue;
        }
        if (char === "/" && source[index + 1] === "*") {
            const end = source.indexOf("*/", index + 2);
            index = end < 0 ? source.length : end + 2;
            continue;
        }
        out += char;
        index++;
    }
    return out.replace(/,(\s*[}\]])/g, "$1");
}

function readJsonStringEnd(text: string, start: number): number {
    let index = start + 1;
    while (index < text.length) {
        if (text[index] === "\\") {
            index += 2;
            continue;
        }
        if (text[index] === '"') {
            return index + 1;
        }
        index++;
    }
    return text.length;
}
