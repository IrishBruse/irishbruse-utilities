import { afterAll, beforeAll, describe, expect, it } from "vite-plus/test";
import { bulletLines, openPlayground, type BulletLine } from "../../../../test/support/browser";
import type { Browser, Page } from "playwright-core";

const fixture = "markdown/list/bullet/test/fixtures/case-1.md";

describe("bullets", () => {
    let browser: Browser;
    let page: Page;
    let lines: BulletLine[];

    beforeAll(async () => {
        const opened = await openPlayground(fixture);
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
        expect(parent && parent.wordLeft).toBeGreaterThan((parent?.bulletRight ?? 0) + 1);
        expect(parent && parent.wordLeft).toBeLessThanOrEqual((parent?.bulletRight ?? 0) + 14);
    });

    it("keeps a bullet on each nested item, set in from the parent", () => {
        const parent = lines.find((line) => line.text === "Bullet A");
        for (const name of ["Nested bullet", "Another nested"]) {
            const nested = lines.find((line) => line.text === name);
            expect(nested?.hitIsBullet).toBe(true);
            expect(nested && parent && nested.bulletLeft).toBeGreaterThan(
                (parent?.bulletLeft ?? 0) + 1,
            );
            expect(nested && nested.wordLeft).toBeGreaterThan((nested?.bulletRight ?? 0) + 1);
            expect(nested && nested.wordLeft).toBeLessThanOrEqual((nested?.bulletRight ?? 0) + 14);
        }
    });
});
