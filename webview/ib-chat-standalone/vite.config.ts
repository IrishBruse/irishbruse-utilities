import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig, type Plugin } from "vite";
import { loadThemeWebviewCss } from "./themeFromJson";

const virtualThemeId = "virtual:ib-chat-theme.css";
const resolvedVirtualThemeId = "\0" + virtualThemeId;

function ibChatThemePlugin(themePath: string): Plugin {
    return {
        name: "ib-chat-theme-json",
        resolveId(id) {
            if (id === virtualThemeId) {
                return resolvedVirtualThemeId;
            }
        },
        load(id) {
            if (id === resolvedVirtualThemeId) {
                if (!fs.existsSync(themePath)) {
                    throw new Error(`IB Chat standalone: theme file not found: ${themePath}`);
                }
                return loadThemeWebviewCss(themePath);
            }
        },
        configureServer(server) {
            server.watcher.add(themePath);
            server.watcher.on("change", (changed) => {
                if (path.resolve(changed) !== path.resolve(themePath)) {
                    return;
                }
                const mod = server.moduleGraph.getModuleById(resolvedVirtualThemeId);
                if (mod) {
                    server.moduleGraph.invalidateModule(mod);
                }
            });
        },
    };
}

const dir = path.dirname(fileURLToPath(import.meta.url));
const repoThemePath = path.resolve(dir, "../../theme.json");

export default defineConfig({
    plugins: [ibChatThemePlugin(repoThemePath)],
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
