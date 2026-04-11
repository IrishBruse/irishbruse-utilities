import path from "node:path";
import { fileURLToPath } from "node:url";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

const dir = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
    plugins: [react()],
    root: dir,
    build: {
        lib: {
            entry: path.join(dir, "src/main.ts"),
            fileName: () => "main.js",
            formats: ["es"],
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
