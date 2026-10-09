import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { openPlayground } from "../support/browser";
import type { Browser, Page } from "playwright-core";

const fixture = "below-last-line/fixtures/case-1.md";

interface BelowPoint {
    readonly endX: number;
    readonly endY: number;
    readonly belowX: number;
    readonly paddingY: number;
    readonly rootY: number;
}

async function belowPoint(page: Page): Promise<BelowPoint> {
    return page.evaluate(() => {
        const last = [...document.querySelectorAll("#editor .view-line")].at(-1);
        const column = document.querySelector(".inline-md-column");
        if (!(last instanceof HTMLElement) || !(column instanceof HTMLElement)) {
            return { endX: 0, endY: 0, belowX: 0, paddingY: 0, rootY: 0 };
        }
        const line = last.getBoundingClientRect();
        const box = column.getBoundingClientRect();
        return {
            endX: line.right - 12,
            endY: line.top + line.height / 2,
            belowX: line.left + 48,
            paddingY: line.bottom + 20,
            rootY: box.bottom + 30,
        };
    });
}

async function readCaret(page: Page): Promise<{ readonly offset: number; readonly focused: boolean }> {
    return page.evaluate(() => {
        const api = (window as unknown as {
            __inlineMarkdown: { getCursor(): number; hasTextFocus(): boolean };
        }).__inlineMarkdown;
        return { offset: api.getCursor(), focused: api.hasTextFocus() };
    });
}

async function resetCaret(page: Page): Promise<void> {
    await page.evaluate(() => {
        const api = (window as unknown as { __inlineMarkdown: { setCursor(offset: number): void } }).__inlineMarkdown;
        api.setCursor(0);
    });
}

async function pointerCursor(page: Page, x: number, y: number): Promise<string> {
    await page.mouse.move(x, y);
    return page.evaluate(({ x, y }) => {
        const hit = document.elementFromPoint(x, y);
        return hit ? getComputedStyle(hit).cursor : "";
    }, { x, y });
}

describe("click below the last line", () => {
    let browser: Browser;
    let page: Page;

    beforeAll(async () => {
        const opened = await openPlayground(fixture, "The note ends here.");
        browser = opened.browser;
        page = opened.page;
    });

    afterAll(async () => {
        await browser?.close();
    });

    it("places the caret at the end of the last line and uses the text pointer", async () => {
        const point = await belowPoint(page);
        expect(point.endY).toBeGreaterThan(0);
        expect(point.paddingY).toBeGreaterThan(point.endY);
        expect(point.rootY).toBeGreaterThan(point.paddingY);

        await resetCaret(page);
        await page.mouse.click(point.endX, point.endY);
        const end = await readCaret(page);
        expect(end.offset).toBeGreaterThan(0);
        expect(end.focused).toBe(true);

        await resetCaret(page);
        await page.mouse.click(point.belowX, point.paddingY);
        expect(await readCaret(page)).toEqual(end);

        await resetCaret(page);
        await page.mouse.click(point.belowX, point.rootY);
        expect(await readCaret(page)).toEqual(end);

        expect(await pointerCursor(page, point.belowX, point.paddingY)).toBe("text");
        expect(await pointerCursor(page, point.belowX, point.rootY)).toBe("text");
    });
});
