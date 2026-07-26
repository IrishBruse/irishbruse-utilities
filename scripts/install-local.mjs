#!/usr/bin/env node
import { execSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const version = JSON.parse(readFileSync(join(root, "package.json"), "utf8")).version;
const vsixPath = join(root, `ib-utilities-${version}.vsix`);

if (!existsSync(vsixPath)) {
    console.error(`VSIX not found: ${vsixPath}`);
    console.error("Run: npm run package:vsix");
    process.exit(1);
}

function resolveCli() {
    if (process.env.VSCODE_CLI) {
        return process.env.VSCODE_CLI;
    }
    for (const candidate of ["cursor", "code"]) {
        try {
            execSync(`command -v ${candidate}`, { stdio: "pipe" });
            return candidate;
        } catch {
            // try next
        }
    }
    return null;
}

const cli = resolveCli();
if (!cli) {
    console.error("Could not find cursor or code on PATH. Set VSCODE_CLI to your editor CLI.");
    process.exit(1);
}

execSync(`${cli} --install-extension ${JSON.stringify(vsixPath)}`, {
    cwd: root,
    stdio: "inherit",
});

console.log(`\nInstalled ${vsixPath} via ${cli}`);
