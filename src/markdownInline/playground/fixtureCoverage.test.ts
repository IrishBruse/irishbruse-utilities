import { describe, expect, it } from "vite-plus/test";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { libFixtureGlobs } from "./fixtureGlobs";

const playgroundDir = dirname(fileURLToPath(import.meta.url));
const libDir = join(playgroundDir, "../lib");
const mainSource = readFileSync(join(playgroundDir, "main.ts"), "utf8");

function walkMarkdownFiles(dir: string): string[] {
    const found: string[] = [];
    for (const name of readdirSync(dir)) {
        const path = join(dir, name);
        if (statSync(path).isDirectory()) {
            found.push(...walkMarkdownFiles(path));
            continue;
        }
        if (name.endsWith(".md")) {
            found.push(path);
        }
    }
    return found;
}

function isLibFixtureMarkdown(relativeToLib: string): boolean {
    if (relativeToLib.includes("/test/fixtures/")) {
        return true;
    }
    return relativeToLib.startsWith("test/") && relativeToLib.includes("/fixtures/");
}

function idMatchesLibFixtureGlob(id: string): boolean {
    if (!id.endsWith(".md")) {
        return false;
    }
    const parts = id.split("/");
    const fixturesAt = parts.indexOf("fixtures");
    if (parts[0] === "test" && fixturesAt >= 2) {
        return true;
    }
    return id.includes("/test/fixtures/");
}

function globCoversId(glob: string): (id: string) => boolean {
    const prefix = "../lib/";
    if (!glob.startsWith(prefix)) {
        return () => false;
    }
    const suffix = glob.slice(prefix.length);
    if (suffix === "test/**/fixtures/**/*.md") {
        return (id) => {
            const parts = id.split("/");
            return parts[0] === "test" && parts.indexOf("fixtures") >= 2 && id.endsWith(".md");
        };
    }
    if (suffix === "**/test/fixtures/**/*.md") {
        return (id) => id.includes("/test/fixtures/") && id.endsWith(".md");
    }
    return () => false;
}

describe("libFixtureGlobs", () => {
    it("keeps literal import.meta.glob patterns in main.ts", () => {
        for (const glob of libFixtureGlobs) {
            expect(mainSource).toContain(`"${glob}"`);
        }
        expect(mainSource).toMatch(/import\.meta\.glob\(\s*\[/);
        expect(mainSource).not.toContain("import.meta.glob(libFixtureGlobs");
    });

    it("covers every markdown file under lib test fixture trees", () => {
        const ids = walkMarkdownFiles(libDir)
            .map((path) => relative(libDir, path).split("\\").join("/"))
            .filter(isLibFixtureMarkdown);

        const matchers = libFixtureGlobs.map(globCoversId);
        const missing = ids.filter((id) => !matchers.some((match) => match(id)));

        expect(missing, `fixtures not covered by libFixtureGlobs:\n${missing.join("\n")}`).toEqual(
            [],
        );
        for (const id of ids) {
            expect(idMatchesLibFixtureGlob(id)).toBe(true);
        }
    });
});
