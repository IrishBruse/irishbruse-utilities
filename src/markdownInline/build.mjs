import * as esbuild from "esbuild";
import { copyFileSync, existsSync, mkdirSync, watch } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(__dirname, "..", "..");
const outDir = join(repoRoot, "media", "markdownInline");
const outFile = join(outDir, "editor.js");
const cssSource = join(__dirname, "src", "editor.css");
const cssOut = join(outDir, "editor.css");

const isWatch = process.argv.includes("--watch");

/** @type {import("esbuild").BuildOptions} */
const config = {
    entryPoints: [join(__dirname, "src", "webview.ts")],
    bundle: true,
    minify: true,
    format: "esm",
    platform: "browser",
    target: ["es2024"],
    outfile: outFile,
    logLevel: "info",
};

function copyEditorCss() {
    mkdirSync(outDir, { recursive: true });
    copyFileSync(cssSource, cssOut);
}

/** @type {import("esbuild").Plugin} */
const copyCssPlugin = {
    name: "copy-editor-css",
    setup(build) {
        build.onEnd((result) => {
            if (result.errors.length === 0) {
                copyEditorCss();
            }
        });
    },
};

if (isWatch) {
    const ctx = await esbuild.context({
        ...config,
        plugins: [copyCssPlugin],
    });
    await ctx.watch();
    if (existsSync(cssSource)) {
        watch(cssSource, () => {
            copyEditorCss();
        });
    }
} else {
    await esbuild.build(config);
    copyEditorCss();
}
