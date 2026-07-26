import { mkdtempSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { Uri } from "vscode";
import { mermaidDocsFixturePath } from "./mermaidDocsFixture";
import {
    formatGblPathLocation,
    isExternalMermaidHref,
    normalizeGblClickPair,
    normalizeGblRelativePath,
    parseMermaidClickTarget,
    resolveMermaidClickTargetPath,
} from "./mermaidClickTarget";
import { parseMermaidClickHrefLines } from "./parseMermaidClickLines";

describe("mermaidEditor/mermaidClickTarget", () => {
    describe("parseMermaidClickTarget", () => {
        it("parses GBL tooltip locations", () => {
            expect(parseMermaidClickTarget("../test.gbl:12:1", "../test.gbl#L12")).toEqual({
                relativePath: "../test.gbl",
                line: 12,
                column: 1,
            });
        });

        it("prefers tooltip over href when both are present", () => {
            expect(parseMermaidClickTarget("../test.gbl:12:10", "../other.gbl#L99")).toEqual({
                relativePath: "../test.gbl",
                line: 12,
                column: 10,
            });
        });

        it("parses href when tooltip is missing", () => {
            expect(parseMermaidClickTarget(undefined, "../test.gbl#L12")).toEqual({
                relativePath: "../test.gbl",
                line: 12,
                column: 1,
            });
        });

        it("parses GBL-style path:line in href", () => {
            expect(parseMermaidClickTarget(undefined, "test.txt:1")).toEqual({
                relativePath: "test.txt",
                line: 1,
                column: 1,
            });
        });

        it("parses GBL-style path:line:column in href", () => {
            expect(parseMermaidClickTarget(undefined, "../test.gbl:3:4")).toEqual({
                relativePath: "../test.gbl",
                line: 3,
                column: 4,
            });
        });

        it("parses VS Code-style #Lline,column href fragments", () => {
            expect(parseMermaidClickTarget(undefined, "../test.gbl#L3,4")).toEqual({
                relativePath: "../test.gbl",
                line: 3,
                column: 4,
            });
        });

        it("parses href without a line fragment", () => {
            expect(parseMermaidClickTarget(undefined, "src/foo.gbl")).toEqual({
                relativePath: "src/foo.gbl",
                line: 1,
                column: 1,
            });
        });

        it("parses #L fragments case-insensitively", () => {
            expect(parseMermaidClickTarget(undefined, "../test.gbl#l99")).toEqual({
                relativePath: "../test.gbl",
                line: 99,
                column: 1,
            });
        });

        it("uses tooltip when href is external but tooltip is a GBL location", () => {
            expect(parseMermaidClickTarget("../test.gbl:5:2", "https://example.com")).toEqual({
                relativePath: "../test.gbl",
                line: 5,
                column: 2,
            });
        });

        it("ignores non-location tooltips and falls back to href", () => {
            expect(parseMermaidClickTarget("Open Main", "../test.gbl#L4")).toEqual({
                relativePath: "../test.gbl",
                line: 4,
                column: 1,
            });
        });

        it("returns undefined when neither value is usable", () => {
            expect(parseMermaidClickTarget(undefined, undefined)).toBeUndefined();
            expect(parseMermaidClickTarget("", "#L12")).toBeUndefined();
            expect(parseMermaidClickTarget("not-a-location", undefined)).toBeUndefined();
        });

        it("does not treat external hrefs as workspace paths when tooltip is absent", () => {
            expect(parseMermaidClickTarget(undefined, "https://example.com/docs")).toBeUndefined();
            expect(isExternalMermaidHref("https://example.com")).toBe(true);
            expect(isExternalMermaidHref("mailto:user@example.com")).toBe(true);
            expect(isExternalMermaidHref("HTTP://EXAMPLE.COM")).toBe(true);
            expect(isExternalMermaidHref("../test.gbl#L1")).toBe(false);
        });
    });

    describe("normalizeGblClickPair", () => {
        it("canonicalizes href and tooltip to path:line:column from tooltip", () => {
            expect(normalizeGblClickPair("../test.gbl#L12", "../test.gbl:12:3")).toEqual({
                href: "../test.gbl",
                tooltip: "../test.gbl:12:3",
            });
        });

        it("formats path:line:column from href when tooltip is absent", () => {
            expect(normalizeGblClickPair("../test.gbl#L5", undefined)).toEqual({
                href: "../test.gbl",
                tooltip: "../test.gbl:5:1",
            });
        });

        it("keeps Mermaid-safe path-only href for test.txt locations", () => {
            expect(normalizeGblClickPair("test.txt:1:1", "test.txt:1:1")).toEqual({
                href: "test.txt",
                tooltip: "test.txt:1:1",
            });
            expect(normalizeGblClickPair("test.txt:3", "test.txt:3")).toEqual({
                href: "test.txt",
                tooltip: "test.txt:3:1",
            });
            expect(normalizeGblClickPair("./test.txt:3:2", "test.txt:3:2")).toEqual({
                href: "test.txt",
                tooltip: "test.txt:3:2",
            });
        });

        it("normalizeGblRelativePath strips ./ prefix", () => {
            expect(normalizeGblRelativePath("./test.txt")).toBe("test.txt");
            expect(normalizeGblRelativePath("test.txt")).toBe("test.txt");
        });

        it("formatGblPathLocation builds GBL location strings", () => {
            expect(formatGblPathLocation("src/foo.gbl", 3, 4)).toBe("src/foo.gbl:3:4");
        });
    });

    describe("call graph fixture integration", () => {
        it("parses test.txt GBL href from call graph fixture", () => {
            const source = readFileSync(mermaidDocsFixturePath("call_graph.mmd"), "utf8");
            const other = parseMermaidClickHrefLines(source).find((c) => c.nodeId === "Other");
            expect(other?.href).toBe("test.txt:3:2");
            expect(other?.tooltip).toBe("test.txt:3:2");
            const target = parseMermaidClickTarget(other!.tooltip, other!.href);
            expect(target).toEqual({ relativePath: "test.txt", line: 3, column: 2 });
        });

        it("parses every click line in the bundled call graph", () => {
            const source = readFileSync(mermaidDocsFixturePath("call_graph.mmd"), "utf8");
            const clicks = parseMermaidClickHrefLines(source);

            expect(clicks).toHaveLength(4);
            for (const { href, tooltip } of clicks) {
                const target = parseMermaidClickTarget(tooltip, href);
                expect(target, `failed for ${href}`).toBeDefined();
                expect(target!.line).toBeGreaterThan(0);
                expect(target!.column).toBeGreaterThan(0);
                if (href.includes("test.gbl")) {
                    expect(target!.relativePath).toBe("../test.gbl");
                }
                if (href.includes("test.txt")) {
                    expect(target!.relativePath).toBe("test.txt");
                }
            }
        });
    });

    describe("resolveMermaidClickTargetPath", () => {
        it("falls back to basename when obj-style relative path is missing", () => {
            const dir = mkdtempSync(join(tmpdir(), "mermaid-click-"));
            const gblPath = join(dir, "test.gbl");
            const mmdPath = join(dir, "callgraph.mmd");
            writeFileSync(gblPath, "");
            writeFileSync(mmdPath, "");

            const resolved = resolveMermaidClickTargetPath(Uri.file(mmdPath), {
                relativePath: "../test.gbl",
                line: 1,
                column: 1,
            });
            expect(resolved).toBe(gblPath);
        });

        it("resolves obj output layout when parent file exists", () => {
            const dir = mkdtempSync(join(tmpdir(), "mermaid-obj-"));
            const objDir = join(dir, "obj");
            mkdirSync(objDir);
            const gblPath = join(dir, "game.gbl");
            const mmdPath = join(objDir, "game.mmd");
            writeFileSync(gblPath, "");
            writeFileSync(mmdPath, "");

            const resolved = resolveMermaidClickTargetPath(Uri.file(mmdPath), {
                relativePath: "../game.gbl",
                line: 10,
                column: 1,
            });
            expect(resolved).toBe(gblPath);
        });

        it("returns the resolved path when no file exists on disk", () => {
            const dir = mkdtempSync(join(tmpdir(), "mermaid-missing-"));
            const mmdPath = join(dir, "graph.mmd");
            writeFileSync(mmdPath, "");

            const resolved = resolveMermaidClickTargetPath(Uri.file(mmdPath), {
                relativePath: "missing.gbl",
                line: 1,
                column: 1,
            });
            expect(resolved).toBe(join(dir, "missing.gbl"));
        });
    });
});
