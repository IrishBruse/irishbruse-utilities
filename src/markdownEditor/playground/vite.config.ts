import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig, type HtmlTagDescriptor, type Plugin } from "vite";
import { markdownEditorAliases } from "../markdownEditorAliases.mjs";
import { readVscodeUserTheme } from "./vscodeUserTheme";

const playgroundDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(playgroundDir, "..", "..", "..");

function vscodeUserThemePlugin(): Plugin {
    return {
        name: "vscode-user-theme",
        transformIndexHtml(html) {
            const theme = readVscodeUserTheme();
            const tags: HtmlTagDescriptor[] = [];
            if (theme.css.length > 0) {
                tags.push({
                    tag: "style",
                    attrs: { id: "vscode-user-theme" },
                    children: theme.css,
                    injectTo: "head",
                });
            }
            return {
                html: html.replace(
                    'class="vscode-dark markdown-playground"',
                    `class="${theme.bodyClass} markdown-playground"`,
                ),
                tags,
            };
        },
    };
}

export default defineConfig({
    root: playgroundDir,
    server: {
        port: 5174,
        fs: {
            allow: [repoRoot],
        },
    },
    resolve: {
        alias: {
            ...markdownEditorAliases,
            "node:fs/promises": join(playgroundDir, "emptyFsPromises.ts"),
        },
    },
    plugins: [vscodeUserThemePlugin()],
});
