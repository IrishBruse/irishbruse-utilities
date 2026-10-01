import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { dragSelectionClassName } from "./dragSelection";

const here = dirname(fileURLToPath(import.meta.url));
const cssPath = join(here, "editor.css");
const editorPath = join(here, "editor.ts");

describe("mouse drag selection", () => {
    it("binds drag selection on the editor column", () => {
        const source = readFileSync(editorPath, "utf8");
        expect(source).toContain("bindDragSelection");
        expect(source).toContain("bindDragSelection(parent");
    });

    it("disables pointer events on rendered blocks while dragging", () => {
        const css = readFileSync(cssPath, "utf8");
        expect(css).toContain(`.inline-md-root.${dragSelectionClassName}`);
        expect(css).toMatch(
            new RegExp(
                `\\.inline-md-root\\.${dragSelectionClassName}[\\s\\S]*\\.inline-md-table[\\s\\S]*pointer-events:\\s*none`,
            ),
        );
    });
});
