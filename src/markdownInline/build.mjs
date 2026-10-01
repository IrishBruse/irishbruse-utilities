import * as esbuild from "esbuild";
import { mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const packageDir = dirname(fileURLToPath(import.meta.url));
const outDir = join(packageDir, "..", "..", "media", "markdownInline");
const isWatch = process.argv.includes("--watch");


const editorConfig = {
    absWorkingDir: packageDir,
    entryPoints: { editor: "src/webview.ts" },
    bundle: true,
    minify: true,
    format: "esm",
    platform: "browser",
    target: ["es2024"],
    outdir: outDir,
    loader: {
        ".ttf": "file",
        ".woff": "file",
        ".woff2": "file",
    },
    logLevel: "info",
};


const workerConfig = {
    absWorkingDir: packageDir,
    entryPoints: ["monaco-editor/esm/vs/editor/editor.worker.js"],
    bundle: true,
    minify: true,
    format: "iife",
    platform: "browser",
    target: ["es2024"],
    outfile: join(outDir, "editor.worker.js"),
    logLevel: "info",
};

mkdirSync(outDir, { recursive: true });

if (isWatch) {
    const editor = await esbuild.context(editorConfig);
    const worker = await esbuild.context(workerConfig);
    await editor.watch();
    await worker.watch();
} else {
    await esbuild.build(editorConfig);
    await esbuild.build(workerConfig);
}
