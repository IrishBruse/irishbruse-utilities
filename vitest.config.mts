import { configDefaults, defineConfig } from "vitest/config";

export default defineConfig({
    test: {
        globals: true,
        environment: "node",
        include: ["src/**/*.test.ts"],
        exclude: [...configDefaults.exclude, "src/markdownInline/tests/**"],
        setupFiles: ["src/test/setup.ts"],
        coverage: {
            provider: "v8",
            exclude: [
                "src/**/*.test.ts",
                "src/markdownInline/tests/**",
                "src/markdownInline/playground/**",
                "src/markdownInline/tests/support/**",
                // Coverage gate: markdown inline only for now.
                "src/clipboard/**",
                "src/commands/**",
                "src/diskConflict/**",
                "src/git/**",
                "src/gitHelpers/**",
                "src/jira/**",
                "src/markdownEditor/**",
                "src/mermaidEditor/**",
                "src/scm/**",
                "src/snippetEditor/**",
                "src/utils/**",
                "src/lib/**",
                "src/ports/**",
                "src/test/**",
                "src/extension.ts",
                "src/global.d.ts",
            ],
            reporter: ["text", "text-summary"],
            thresholds: {
                statements: 90,
                branches: 90,
                functions: 90,
                lines: 90,
            },
        },
    },
});
