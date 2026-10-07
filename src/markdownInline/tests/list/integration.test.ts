import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { bulletLines, openPlayground, type BulletLine } from "../support/browser";
import type { Browser, Page } from "playwright-core";

describe("lists", () => {
    let browser: Browser;
    let page: Page;
    let lines: BulletLine[];

    beforeAll(async () => {
        const opened = await openPlayground("list/fixtures/case-1.md");
        browser = opened.browser;
        page = opened.page;
        lines = await bulletLines(page, ["Bullet A", "Nested bullet", "Another nested"]);
    });

    afterAll(async () => {
        await browser?.close();
    });

    it("shows a bullet beside a top-level item", () => {
        const parent = lines.find((line) => line.text === "Bullet A");
        expect(parent?.hitIsBullet).toBe(true);
        expect(parent?.insideMargin).toBe(false);
        expect(parent && parent.wordLeft).toBeGreaterThanOrEqual((parent?.bulletRight ?? 0) - 2);
        expect(parent && parent.wordLeft).toBeLessThanOrEqual((parent?.bulletRight ?? 0) + 2);
    });

    it("keeps a bullet on each nested item, set in from the parent", () => {
        const parent = lines.find((line) => line.text === "Bullet A");
        for (const name of ["Nested bullet", "Another nested"]) {
            const nested = lines.find((line) => line.text === name);
            expect(nested?.hitIsBullet).toBe(true);
            expect(nested && parent && nested.bulletLeft).toBeGreaterThan((parent?.bulletLeft ?? 0) + 1);
            expect(nested && nested.wordLeft).toBeGreaterThanOrEqual((nested?.bulletRight ?? 0) - 2);
            expect(nested && nested.wordLeft).toBeLessThanOrEqual((nested?.bulletRight ?? 0) + 2);
        }
    });

    it("keeps numbers visible on a numbered list", async () => {
        const text = (await page.locator("#editor .view-lines").innerText()).replaceAll("\u00a0", " ");
        expect(text).toContain("1. Ordered one");
        expect(text).toContain("1. Nested ordered");
    });
});
