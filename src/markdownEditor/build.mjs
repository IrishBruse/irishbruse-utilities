import * as esbuild from "esbuild";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(__dirname, "..", "..");
const srcDir = join(__dirname, "webview");
const outDir = join(repoRoot, "media", "markdownEditor");

const isWatch = process.argv.includes("--watch");

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

async function buildOnce() {
    await esbuild.build(config);
}

if (isWatch) {
    const ctx = await esbuild.context(config);
    await ctx.watch();
} else {
    await buildOnce();
}
