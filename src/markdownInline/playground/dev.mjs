import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const playgroundDir = dirname(fileURLToPath(import.meta.url));
const packageDir = join(playgroundDir, "..");
const require = createRequire(join(packageDir, "package.json"));
const viteRoot = dirname(require.resolve("vite/package.json"));
const viteBin = join(viteRoot, "bin", "vite.js");
const viteArgs = [viteBin, "--config", "playground/vite.config.ts"];

let child = null;
let stopping = false;

function start() {
    child = spawn(process.execPath, viteArgs, {
        cwd: packageDir,
        stdio: "inherit",
        env: process.env,
    });
    child.on("exit", (code, signal) => {
        child = null;
        if (stopping) {
            process.exit(code ?? (signal ? 1 : 0));
            return;
        }
        if (code === 0 && !signal) {
            process.exit(0);
            return;
        }
        const reason = signal ?? code;
        process.stderr.write(`[markdown-inline dev] vite exited (${reason}); restarting in 1s\n`);
        setTimeout(start, 1000);
    });
}

function stop(signal) {
    if (stopping) {
        process.exit(130);
        return;
    }
    stopping = true;
    if (child) {
        child.kill(signal);
    } else {
        process.exit(0);
    }
}

process.on("SIGINT", () => stop("SIGINT"));
process.on("SIGTERM", () => stop("SIGTERM"));

start();
