import * as esbuild from "esbuild";
import { copyFileSync, mkdirSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const mermaidSource = join(__dirname, "node_modules", "mermaid", "dist", "mermaid.min.js");
const mermaidDestDir = join(__dirname, "media", "mermaidPreview");
const mermaidDest = join(mermaidDestDir, "mermaid.min.js");

function copyMermaidAssets() {
    mkdirSync(mermaidDestDir, { recursive: true });
    copyFileSync(mermaidSource, mermaidDest);
}

const args = process.argv.splice(2);

const validArgs = ["--production", "--watch", "--help"];
const isProd = args.includes("--production");
const isWatch = args.includes("--watch");
const isHelp = args.includes("--help");

if (isHelp) {
    printHelp();
}

const invalidArgs = args.filter((arg) => !validArgs.includes(arg));
if (invalidArgs.length > 0) {
    console.error("Invalid arguments:", invalidArgs.join(", "));
    printHelp();
}

function printHelp() {
    console.log(`Usage: node script.js [options]`);
    console.log();
    console.log(`Options:`);
    console.log(`  --production  Run in production mode`);
    console.log(`  --watch       Enable watch mode`);
    console.log(`  --help        Show this help message`);
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

async function buildAll() {
    copyMermaidAssets();
    await Promise.all([esbuild.build(extensionConfig), esbuild.build(mermaidThemeConfig)]);
}

if (isWatch) {
    copyMermaidAssets();
    const [extensionCtx, themeCtx] = await Promise.all([
        esbuild.context(extensionConfig),
        esbuild.context(mermaidThemeConfig),
    ]);
    await Promise.all([extensionCtx.watch(), themeCtx.watch()]);
} else {
    await buildAll();
}
