import { defineConfig } from "vitest/config";

export default defineConfig({
    test: {
        globals: true,
        environment: "node",
        include: ["src/**/*.test.ts", ".cursor/skills/verify-markdownInline/cli/**/*.test.ts"],
        setupFiles: ["src/test/setup.ts"],
    },
});
