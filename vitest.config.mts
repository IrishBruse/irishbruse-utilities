import { defineConfig } from "vitest/config";

export default defineConfig({
    test: {
        globals: true,
        environment: "node",
        include: ["src/**/*.test.ts", "webview/**/*.test.ts"],
        setupFiles: ["src/test/setup.ts"],
    },
});
