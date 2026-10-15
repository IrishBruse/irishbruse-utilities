import { defineConfig } from "vite-plus";
import type { PackUserConfig } from "vite-plus/pack";

const pack: PackUserConfig[] = [
    {
        name: "extension",
        entry: { extension: "src/extension.ts" },
        format: "cjs",
        platform: "node",
        outDir: "dist",
        target: "node20",
        deps: { neverBundle: ["vscode"] },
        dts: false,
        fixedExtension: false,
        hash: false,
        sourcemap: true,
    },
    {
        name: "mermaid-theme",
        entry: { vsCodeTheme: "src/lib/mermaid/vsCodeTheme.browser.ts" },
        format: "iife",
        globalName: "IbMermaidVsCodeThemeBundle",
        platform: "browser",
        outDir: "media/mermaidPreview",
        target: "es2020",
        dts: false,
        hash: false,
        clean: false,
        sourcemap: true,
        outputOptions: (options, format) =>
            format === "iife"
                ? { ...options, entryFileNames: "[name].js", chunkFileNames: "[name].js" }
                : options,
        copy: [{ from: "node_modules/mermaid/dist/mermaid.min.js", to: "media/mermaidPreview" }],
    },
];

export default defineConfig({
    pack,
    staged: {
        "*": "vp check --fix",
    },
    test: {
        globals: true,
        environment: "node",
        setupFiles: ["src/test/setup.ts"],
        coverage: {
            provider: "v8",
            include: ["src/markdownInline/lib/**"],
            exclude: [
                "src/markdownInline/lib/decorations.ts",
                "src/markdownInline/lib/editor.ts",
                "src/markdownInline/lib/webview.ts",
                "src/markdownInline/lib/monaco/codeLens.ts",
                "src/markdownInline/lib/monaco/keybindings.ts",
                "src/markdownInline/lib/monaco/setup.ts",
                "src/markdownInline/lib/test/**",
                "src/markdownInline/lib/markdown/table/style.ts",
                "src/markdownInline/lib/markdown/image/style.ts",
                "src/markdownInline/lib/markdown/fence/mermaid/style.ts",
                "src/markdownInline/lib/markdown/shared/range.ts",
            ],
            reporter: ["text", "text-summary"],
            thresholds: {
                statements: 90,
                branches: 90,
                functions: 90,
                lines: 90,
            },
        },
        projects: [
            {
                test: {
                    name: "unit",
                    include: ["src/**/*.test.ts"],
                    exclude: [
                        "src/markdownInline/lib/**/integration.test.ts",
                        "src/markdownInline/lib/**/regression.test.ts",
                    ],
                },
            },
            {
                test: {
                    name: "markdownInline",
                    include: [
                        "src/markdownInline/lib/**/integration.test.ts",
                        "src/markdownInline/lib/**/regression.test.ts",
                    ],
                    fileParallelism: false,
                    testTimeout: 30_000,
                    hookTimeout: 30_000,
                },
            },
        ],
    },
    fmt: {
        tabWidth: 4,
    },
    lint: {
        plugins: ["oxc", "typescript", "unicorn", "import", "node"],
        options: {
            typeAware: true,
            typeCheck: true,
        },
        env: {
            builtin: true,
        },
        ignorePatterns: [
            ".tmp/**",
            "out/**",
            "dist/**",
            "**/dist/**",
            "node_modules/**",
            "media/**",
            "!media/mermaidPreview/preview.js",
            "**/*.min.js",
        ],
        rules: {
            curly: ["error", "all"],
            eqeqeq: ["error", "always"],
            "no-empty": ["error", { allowEmptyCatch: true }],
            "no-eval": "error",
            "no-implied-eval": "error",
            "no-throw-literal": "off",
            "no-unused-vars": [
                "error",
                {
                    args: "all",
                    argsIgnorePattern: "^_",
                    caughtErrors: "all",
                    caughtErrorsIgnorePattern: "^_",
                    destructuredArrayIgnorePattern: "^_",
                    varsIgnorePattern: "^_",
                    ignoreRestSiblings: true,
                },
            ],
            "vite-plus/prefer-vite-plus-imports": "error",
            "import/no-cycle": "error",
            "vscode/no-dropped-disposable": "error",
            "typescript/no-explicit-any": "error",
            "typescript/await-thenable": "error",
            "typescript/no-deprecated": [
                "error",
                {
                    allow: [
                        { from: "lib", name: "caretRangeFromPoint" },
                        { from: "lib", name: "charCode" },
                        { from: "lib", name: "execCommand" },
                        { from: "lib", name: "keyCode" },
                        { from: "lib", name: "which" },
                    ],
                },
            ],
            "typescript/no-floating-promises": "error",
            "typescript/no-misused-promises": "error",
            "typescript/only-throw-error": "error",
            "typescript/switch-exhaustiveness-check": [
                "error",
                { considerDefaultExhaustiveForUnions: true },
            ],
        },
        jsPlugins: [
            {
                name: "vite-plus",
                specifier: "vite-plus/oxlint-plugin",
            },
            {
                name: "vscode",
                specifier: "./lint/vscodeExtension.js",
            },
        ],
    },
});
