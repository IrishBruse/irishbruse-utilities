import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vite-plus/test";
import { createLargeDocumentFit } from "./editorFit";

const editorPath = join(dirname(fileURLToPath(import.meta.url)), "editor.ts");

describe("large document resize", () => {
    it("fits a large document once after the size settles", () => {
        const source = readFileSync(editorPath, "utf8");
        const observer = source.slice(
            source.indexOf("const resizeObserver"),
            source.indexOf("resizeObserver.observe"),
        );
        expect(observer).toContain("createLargeDocumentFit");
    });

    it("runs one fit after a burst of large-document resizes", () => {
        const fits: string[] = [];
        const pending = new Map<number, () => void>();
        let nextId = 1;
        const fit = createLargeDocumentFit(
            () => true,
            () => {
                fits.push("soon");
            },
            () => {
                fits.push("settled");
            },
            (callback) => {
                const id = nextId;
                nextId += 1;
                pending.set(id, callback);
                return id;
            },
            (id) => {
                pending.delete(id);
            },
        );
        fit.onResize();
        fit.onResize();
        fit.onResize();
        expect(fits).toEqual([]);
        expect(pending.size).toBe(1);
        const only = [...pending.values()][0];
        only?.();
        expect(fits).toEqual(["settled"]);
        fit.dispose();
    });

    it("fits a small document on each resize", () => {
        const fits: string[] = [];
        const fit = createLargeDocumentFit(
            () => false,
            () => {
                fits.push("soon");
            },
            () => {
                fits.push("settled");
            },
            () => 1,
            () => undefined,
        );
        fit.onResize();
        fit.onResize();
        expect(fits).toEqual(["soon", "soon"]);
        fit.dispose();
    });
});
