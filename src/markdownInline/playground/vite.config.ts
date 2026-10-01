import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig, type HtmlTagDescriptor, type Plugin } from "vite";
import { readPlaygroundTheme } from "./vscodeUserTheme.ts";

const playgroundDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(playgroundDir, "..", "..", "..");

function vscodeUserThemePlugin(): Plugin {
    return {
        name: "vscode-user-theme",
        transformIndexHtml(html) {
            const theme = readPlaygroundTheme();
            const tags: HtmlTagDescriptor[] = [];
            if (theme.css.length > 0) {
                tags.push({
                    tag: "style",
                    attrs: { id: "vscode-user-settings-overrides" },
                    children: theme.css,
                    injectTo: "head",
                });
            }
            return {
                html: html.replace('class="vscode-dark"', `class="${theme.bodyClass}"`),
                tags,
            };
        },
    };
}

export default defineConfig({
    root: playgroundDir,
    define: {
        __DOCS_MARKDOWN_FS__: JSON.stringify(join(repoRoot, "docs/tests/markdown")),
    },
    server: {
        port: 5175,
        strictPort: true,
        fs: {
            allow: [repoRoot],
        },
    },
    plugins: [vscodeUserThemePlugin()],
});
