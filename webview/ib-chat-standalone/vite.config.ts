import path from "node:path";
import { fileURLToPath } from "node:url";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

const dir = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
    plugins: [react()],
    root: dir,
    server: {
        port: 5173,
        proxy: {
            "/__ib_chat_ws": {
                target: "ws://localhost:5174",
                ws: true,
                rewrite: () => "/",
            },
        },
    },
    build: {
        outDir: path.join(dir, "../../media/ib-chat-standalone"),
        emptyOutDir: true,
    },
});
