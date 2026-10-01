import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { dragSelectionClassName } from "./dragSelection";

const here = dirname(fileURLToPath(import.meta.url));
const dragCssPath = join(here, "styles/selection/dragging.css");
const layersCssPath = join(here, "styles/monaco/view-layers.css");
const editorPath = join(here, "editor.ts");

describe("mouse drag selection", () => {
    it("binds drag selection on the editor column", () => {
        const source = readFileSync(editorPath, "utf8");
        expect(source).toContain("bindDragSelection");
        expect(source).toContain("bindDragSelection(parent");
    });

    it("disables pointer events on rendered blocks while dragging", () => {
        const css = readFileSync(dragCssPath, "utf8");
        expect(css).toContain(`.inline-md-root.${dragSelectionClassName}`);
        expect(css).toMatch(
            new RegExp(
                `\\.inline-md-root\\.${dragSelectionClassName}[\\s\\S]*\\.view-zones[\\s\\S]*pointer-events:\\s*none`,
            ),
        );
    });

    it("keeps the editor height stable and paints selection above line decorations", () => {
        const source = readFileSync(editorPath, "utf8");
        const fitNow = source.slice(source.indexOf("const fitNow"), source.indexOf("const fitContent"));
        expect(fitNow).toContain("isDragSelecting");
        const cursor = source.slice(source.indexOf("onDidChangeCursorSelection"), source.indexOf("const openRenderedLink"));
        expect(cursor).toContain("isDragSelecting");
        const css = readFileSync(layersCssPath, "utf8");
        expect(css).toContain(".view-overlays > div:has(.selected-text)");
        expect(css).toMatch(/\.view-lines\s*\{[^}]*z-index:\s*3/);
    });
});
