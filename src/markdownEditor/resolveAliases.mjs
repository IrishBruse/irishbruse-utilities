import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const packageRoot = join(repoRoot, "src", "markdownEditor", "packages", "markdown-editor");

/** Resolve the vendored editor instead of the published npm package. */
export const markdownEditorAliases = {
    "@vscode/markdown-editor/editor.css": join(packageRoot, "src", "view", "editor.css"),
    "@vscode/markdown-editor/themes/vscode-default.css": join(
        packageRoot,
        "src",
        "view",
        "themes",
        "vscode-default.css",
    ),
    "@vscode/markdown-editor": join(packageRoot, "src", "index.ts"),
    "@vscode/markdown-editor$": join(packageRoot, "src", "index.ts"),
    "entities/decode": join(repoRoot, "node_modules", "entities", "dist", "esm", "decode.js"),
};
