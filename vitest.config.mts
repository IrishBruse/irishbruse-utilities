import { configDefaults, defineConfig } from "vitest/config";

export default defineConfig({
    test: {
        globals: true,
        environment: "node",
        include: ["src/**/*.test.ts", ".cursor/skills/verify-markdownInline/cli/**/*.test.ts"],
        exclude: [...configDefaults.exclude, "src/markdownInline/tests/**"],
        setupFiles: ["src/test/setup.ts"],
    },
});
