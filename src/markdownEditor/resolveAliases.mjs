import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const markdownEditorDir = dirname(fileURLToPath(import.meta.url));
const vendoredEditorRoot = join(markdownEditorDir, "packages", "markdown-editor");
const require = createRequire(import.meta.url);

/** Resolve the vendored editor instead of the published npm package. */
export const markdownEditorAliases = {
    "@vscode/markdown-editor/editor.css": join(vendoredEditorRoot, "src", "view", "editor.css"),
    "@vscode/markdown-editor/themes/vscode-default.css": join(
        vendoredEditorRoot,
        "src",
        "view",
        "themes",
        "vscode-default.css",
    ),
    "@vscode/markdown-editor": join(vendoredEditorRoot, "src", "index.ts"),
    "@vscode/markdown-editor$": join(vendoredEditorRoot, "src", "index.ts"),
    "entities/decode": require.resolve("entities/decode"),
};
