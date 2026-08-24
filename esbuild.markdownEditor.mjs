import * as esbuild from "esbuild";
import { cpSync, mkdirSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const srcDir = join(__dirname, "markdown-editor-src");
const outDir = join(__dirname, "media", "markdownEditor");
const vscodeOutDir = join(
    __dirname,
    "..",
    "vscode",
    "extensions",
    "markdown-language-features",
    "markdown-editor-out",
);

const isWatch = process.argv.includes("--watch");
const syncToVscode = process.argv.includes("--sync-vscode");

/** @type {import("esbuild").BuildOptions} */
const config = {
    entryPoints: [join(srcDir, "editor.ts")],
    bundle: true,
    minify: true,
    sourcemap: false,
    format: "esm",
    platform: "browser",
    target: ["es2024"],
    outdir: outDir,
    splitting: true,
    chunkNames: "[name]-[hash]",
    // `@vscode/diff` has a Node-only code path that dynamically imports
    // `node:fs/promises` (guarded by a `process.versions.node` check). It is
    // dead code in the webview, so mark it external to avoid a resolve error.
    external: ["node:fs/promises"],
    loader: {
        ".woff": "file",
        ".woff2": "file",
        ".ttf": "file",
        ".eot": "file",
        ".svg": "file",
    },
    assetNames: "[name]-[hash]",
    logLevel: "info",
};

function syncBuildToVscode() {
    if (!syncToVscode) {
        return;
    }
    mkdirSync(vscodeOutDir, { recursive: true });
    cpSync(outDir, vscodeOutDir, { recursive: true, force: true });
    console.log(`Synced markdown editor bundle to ${vscodeOutDir}`);
}

async function buildOnce() {
    await esbuild.build(config);
    syncBuildToVscode();
}

if (isWatch) {
    const ctx = await esbuild.context(config);
    await ctx.watch();
    if (syncToVscode) {
        const { watch } = await import("node:fs");
        watch(outDir, { recursive: true }, () => syncBuildToVscode());
        console.log(`Watching ${outDir}; will sync to ${vscodeOutDir}`);
    }
} else {
    await buildOnce();
}
