import path from "node:path";
import { fileURLToPath } from "node:url";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

const dir = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
    plugins: [react()],
    root: dir,
    define: {
        "process.env.NODE_ENV": JSON.stringify("production"),
    },
    build: {
        lib: {
            entry: path.join(dir, "src/main.ts"),
            name: "IbChat",
            fileName: () => "main.js",
            formats: ["iife"],
        },
        outDir: path.join(dir, "../../media/ib-chat"),
        emptyOutDir: true,
        cssCodeSplit: false,
        rollupOptions: {
            output: {
                assetFileNames: "main[extname]",
            },
        },
    },
});
