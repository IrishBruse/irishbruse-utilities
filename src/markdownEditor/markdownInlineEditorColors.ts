import { workspace } from "vscode";

/** Last-resort defaults matching markdownInlineEditor.colors in user settings. */
export const DEFAULT_MARKDOWN_INLINE_EDITOR_COLORS = {
    heading1: "#D19A66",
    heading2: "#E06C75",
    heading3: "#61AFEF",
    heading4: "#C678DD",
    heading5: "#C678DD",
    heading6: "#C678DD",
    inlineCode: "#C678DD",
    inlineCodeBackground: "#21252bA0",
} as const;

export type MarkdownInlineEditorColors = {
    readonly [K in keyof typeof DEFAULT_MARKDOWN_INLINE_EDITOR_COLORS]: string;
};

function readColor(configKey: string, fallback: string): string {
    const value = workspace.getConfiguration("markdownInlineEditor").get<unknown>(`colors.${configKey}`);
    return typeof value === "string" && value.trim().length > 0 ? value.trim() : fallback;
}

/** Prefer `markdownInlineEditor.colors.*` from settings; fall back to hard-coded defaults. */
export function getMarkdownInlineEditorColors(): MarkdownInlineEditorColors {
    const defaults = DEFAULT_MARKDOWN_INLINE_EDITOR_COLORS;
    return {
        heading1: readColor("heading1", defaults.heading1),
        heading2: readColor("heading2", defaults.heading2),
        heading3: readColor("heading3", defaults.heading3),
        heading4: readColor("heading4", defaults.heading4),
        heading5: readColor("heading5", defaults.heading5),
        heading6: readColor("heading6", defaults.heading6),
        inlineCode: readColor("inlineCode", defaults.inlineCode),
        inlineCodeBackground: readColor("inlineCodeBackground", defaults.inlineCodeBackground),
    };
}

/** CSS custom properties for the markdown editor webview. */
export function markdownInlineEditorColorsCssVars(colors: MarkdownInlineEditorColors): string {
    return [
        `--ib-md-heading-1: ${colors.heading1};`,
        `--ib-md-heading-2: ${colors.heading2};`,
        `--ib-md-heading-3: ${colors.heading3};`,
        `--ib-md-heading-4: ${colors.heading4};`,
        `--ib-md-heading-5: ${colors.heading5};`,
        `--ib-md-heading-6: ${colors.heading6};`,
        `--ib-md-inline-code: ${colors.inlineCode};`,
        `--ib-md-inline-code-background: ${colors.inlineCodeBackground};`,
    ].join("\n\t\t");
}
