import { defineConfig } from "vitest/config";
import { markdownEditorAliases } from "./src/markdownEditor/resolveAliases.mjs";

/** @type {import("vite").Plugin} */
function markdownEditorResolvePlugin() {
    return {
        name: "markdown-editor-vendored-resolve",
        resolveId(source) {
            if (source in markdownEditorAliases) {
                return markdownEditorAliases[source as keyof typeof markdownEditorAliases];
            }
            if (source === "@vscode/markdown-editor") {
                return markdownEditorAliases["@vscode/markdown-editor"];
            }
            return undefined;
        },
    };
}

export default defineConfig({
    plugins: [markdownEditorResolvePlugin()],
    resolve: {
        alias: markdownEditorAliases,
        tsconfigPaths: true,
    },
    test: {
        globals: true,
        environment: "node",
        include: ["src/**/*.test.ts"],
        setupFiles: ["src/test/setup.ts"],
    },
});
