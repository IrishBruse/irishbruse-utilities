import * as esbuild from "esbuild";
import { copyFileSync, cpSync, mkdirSync, watch } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const isMain = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);

import { markdownEditorAliases } from "./src/markdownEditor/resolveAliases.mjs";

export { markdownEditorAliases };

const mermaidSource = join(__dirname, "node_modules", "mermaid", "dist", "mermaid.min.js");
const mermaidDestDir = join(__dirname, "media", "mermaidPreview");
const mermaidDest = join(mermaidDestDir, "mermaid.min.js");

function copyMermaidAssets() {
    mkdirSync(mermaidDestDir, { recursive: true });
    copyFileSync(mermaidSource, mermaidDest);
}

const onigWasmSource = join(__dirname, "node_modules", "vscode-oniguruma", "release", "onig.wasm");
const onigWasmDest = join(__dirname, "dist", "onig.wasm");

function copyOnigWasm() {
    mkdirSync(join(__dirname, "dist"), { recursive: true });
    copyFileSync(onigWasmSource, onigWasmDest);
}

const markdownEditorOutDir = join(__dirname, "media", "markdownEditor");
const markdownEditorVscodeOutDir = join(
    __dirname,
    "..",
    "vscode",
    "extensions",
    "markdown-language-features",
    "markdown-editor-out",
);

/** @type {import("esbuild").BuildOptions} */
function markdownEditorWebviewConfig() {
    return {
        entryPoints: [join(__dirname, "src", "markdownEditor", "webview", "editor.ts")],
        bundle: true,
        minify: true,
        sourcemap: false,
        format: "esm",
        platform: "browser",
        target: ["es2024"],
        outdir: markdownEditorOutDir,
        splitting: true,
        chunkNames: "[name]-[hash]",
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
        alias: markdownEditorAliases,
    };
}

function syncMarkdownEditorToVscode() {
    mkdirSync(markdownEditorVscodeOutDir, { recursive: true });
    cpSync(markdownEditorOutDir, markdownEditorVscodeOutDir, { recursive: true, force: true });
    console.log(`Synced markdown editor bundle to ${markdownEditorVscodeOutDir}`);
}

const args = isMain ? process.argv.slice(2) : [];

const validArgs = [
    "--production",
    "--watch",
    "--help",
    "--markdown-editor",
    "--sync-vscode",
];
const isProd = args.includes("--production");
const isWatch = args.includes("--watch");
const isHelp = args.includes("--help");
const markdownEditorOnly = args.includes("--markdown-editor");
const syncToVscode = args.includes("--sync-vscode");

if (isMain && isHelp) {
    printHelp();
}

if (isMain) {
    const invalidArgs = args.filter((arg) => !validArgs.includes(arg));
    if (invalidArgs.length > 0) {
        console.error("Invalid arguments:", invalidArgs.join(", "));
        printHelp();
    }
}

function printHelp() {
    console.log(`Usage: node esbuild.mjs [options]`);
    console.log();
    console.log(`Options:`);
    console.log(`  --production       Run in production mode`);
    console.log(`  --watch            Enable watch mode`);
    console.log(`  --markdown-editor  Build only the markdown editor webview`);
    console.log(`  --sync-vscode      Copy webview output to a local vscode checkout`);
    console.log(`  --help             Show this help message`);
    process.exit(0);
}

/** @type {import("esbuild").BuildOptions} */
const extensionConfig = {
    entryPoints: ["src/extension.ts"],
    bundle: true,
    platform: "node",
    target: "node20",
    sourcemap: !isProd,
    minify: isProd,
    treeShaking: isProd,
    external: ["vscode"],
    logLevel: "info",
    outfile: "dist/extension.js",
};

/** @type {import("esbuild").BuildOptions} */
const mermaidThemeConfig = {
    entryPoints: ["src/mermaidEditor/vsCodeTheme.browser.ts"],
    bundle: true,
    platform: "browser",
    target: "es2020",
    sourcemap: !isProd,
    minify: isProd,
    logLevel: "info",
    outfile: join(mermaidDestDir, "vsCodeTheme.js"),
};

async function buildMarkdownEditorWebview() {
    await esbuild.build(markdownEditorWebviewConfig());
    if (syncToVscode) {
        syncMarkdownEditorToVscode();
    }
}

async function buildExtensionStack() {
    copyMermaidAssets();
    copyOnigWasm();
    await Promise.all([esbuild.build(extensionConfig), esbuild.build(mermaidThemeConfig)]);
}

async function buildAll() {
    if (markdownEditorOnly) {
        await buildMarkdownEditorWebview();
        return;
    }
    await buildExtensionStack();
    await buildMarkdownEditorWebview();
}

if (isMain) {
    if (isWatch) {
        if (markdownEditorOnly) {
            const ctx = await esbuild.context(markdownEditorWebviewConfig());
            await ctx.watch();
            if (syncToVscode) {
                watch(markdownEditorOutDir, { recursive: true }, () => syncMarkdownEditorToVscode());
                console.log(`Watching ${markdownEditorOutDir}; will sync to ${markdownEditorVscodeOutDir}`);
            }
        } else {
            copyMermaidAssets();
            copyOnigWasm();
            const [extensionCtx, themeCtx, markdownCtx] = await Promise.all([
                esbuild.context(extensionConfig),
                esbuild.context(mermaidThemeConfig),
                esbuild.context(markdownEditorWebviewConfig()),
            ]);
            await Promise.all([extensionCtx.watch(), themeCtx.watch(), markdownCtx.watch()]);
            if (syncToVscode) {
                watch(markdownEditorOutDir, { recursive: true }, () => syncMarkdownEditorToVscode());
            }
        }
    } else {
        await buildAll();
    }
}
