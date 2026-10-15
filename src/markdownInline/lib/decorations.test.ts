import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vite-plus/test";

const decorationsPath = join(dirname(fileURLToPath(import.meta.url)), "decorations.ts");

const paintedWindowScrollPad = 40;

function paintedWindowNeedsRebuild(
    visibleFirstLine: number,
    visibleLastLine: number,
    painted: { startLine: number; endLine: number },
    pad = paintedWindowScrollPad,
): boolean {
    if (painted.startLine === 0 && painted.endLine === 0) {
        return true;
    }
    return visibleFirstLine < painted.startLine + pad || visibleLastLine > painted.endLine - pad;
}

describe("painted window", () => {
    it("keeps the rebuild helper in decorations.ts", () => {
        const source = readFileSync(decorationsPath, "utf8");
        expect(source).toContain("export function paintedWindowNeedsRebuild");
        expect(source).toContain("visibleFirstLine < painted.startLine + pad");
    });

    it("rebuilds when the visible range leaves the padded window", () => {
        const painted = { startLine: 100, endLine: 500 };
        expect(paintedWindowNeedsRebuild(99, 120, painted)).toBe(true);
        expect(paintedWindowNeedsRebuild(140, 461, painted)).toBe(true);
        expect(paintedWindowNeedsRebuild(140, 460, painted)).toBe(false);
        expect(paintedWindowNeedsRebuild(100 + paintedWindowScrollPad, 460, painted)).toBe(false);
    });

    it("rebuilds before the first paint", () => {
        expect(paintedWindowNeedsRebuild(1, 40, { startLine: 0, endLine: 0 })).toBe(true);
    });

    it("paints the window once after a fast scroll", () => {
        const source = readFileSync(decorationsPath, "utf8");
        const scheduleWindow = source.slice(
            source.indexOf("private scheduleWindow"),
            source.indexOf("private lineWindow"),
        );
        const withoutScheduledCallbacks = scheduleWindow.replace(
            /setTimeout\([\s\S]*\},\s*\w+\)/g,
            "",
        );
        expect(withoutScheduledCallbacks).not.toContain("this.update()");
        expect(scheduleWindow).not.toContain("requestAnimationFrame");
        expect(scheduleWindow).toContain("clearTimeout");
        expect(scheduleWindow).toMatch(/setTimeout\([^,]+,\s*(\w+)\)/);
        const delayConstant = scheduleWindow.match(/setTimeout\([^,]+,\s*(\w+)\)/)?.[1];
        expect(delayConstant).toBeDefined();
        const delayValue = Number(source.match(new RegExp(`const ${delayConstant} = (\\d+)`))?.[1]);
        expect(delayValue).toBeGreaterThanOrEqual(80);
    });
});
