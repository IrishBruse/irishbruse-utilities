import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const packageRoot = join(fileURLToPath(new URL(".", import.meta.url)), "..");

function collectTsFiles(dir: string): string[] {
    const entries = readdirSync(dir, { withFileTypes: true });
    const files: string[] = [];
    for (const entry of entries) {
        const path = join(dir, entry.name);
        if (entry.isDirectory()) {
            files.push(...collectTsFiles(path));
        } else if (entry.name.endsWith(".ts") && !entry.name.endsWith(".d.ts")) {
            files.push(path);
        }
    }
    return files;
}

const markdownEditorImport = /from\s+["'][^"']*markdownEditor/;
const mermaidEditorImport = /from\s+["'][^"']*mermaidEditor/;

function isAllowedImport(line: string): boolean {
    if (mermaidEditorImport.test(line)) {
        return true;
    }
    if (markdownEditorImport.test(line)) {
        return false;
    }
    const relative = /from\s+["'](\.\.\/[^"']+)["']/.exec(line);
    if (!relative) {
        return true;
    }
    const path = relative[1];
    if (path.startsWith("../") && !path.includes("mermaidEditor")) {
        return false;
    }
    return true;
}

describe("markdownInline package boundary", () => {
    it("src/ does not import outside the package (except mermaidEditor)", () => {
        const srcDir = join(packageRoot, "src");
        const violations: string[] = [];
        for (const file of collectTsFiles(srcDir)) {
            const text = readFileSync(file, "utf8");
            const rel = file.slice(packageRoot.length + 1);
            for (const line of text.split("\n")) {
                const trimmed = line.trim();
                if (!trimmed.startsWith("import ") && !trimmed.includes(" from ")) {
                    continue;
                }
                if (!isAllowedImport(trimmed)) {
                    violations.push(`${rel}: ${trimmed}`);
                }
            }
        }
        expect(violations).toEqual([]);
    });

    it("playground/ does not import extension host code", () => {
        const playgroundDir = join(packageRoot, "playground");
        const violations: string[] = [];
        for (const file of collectTsFiles(playgroundDir)) {
            const text = readFileSync(file, "utf8");
            const rel = file.slice(packageRoot.length + 1);
            for (const line of text.split("\n")) {
                const trimmed = line.trim();
                if (!trimmed.startsWith("import ") && !trimmed.includes(" from ")) {
                    continue;
                }
                if (markdownEditorImport.test(trimmed) || mermaidEditorImport.test(trimmed)) {
                    violations.push(`${rel}: ${trimmed}`);
                }
            }
        }
        expect(violations).toEqual([]);
    });
});
