import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { openPlayground } from "../support/browser";
import type { Browser, Page } from "playwright-core";

const sample = readFileSync(join(dirname(fileURLToPath(import.meta.url)), "fixtures", "case-1.md"), "utf8");

describe("scroll", () => {
    let browser: Browser;
    let page: Page;

    beforeAll(async () => {
        const opened = await openPlayground("scroll/fixtures/case-1.md", "Scroll sample");
        browser = opened.browser;
        page = opened.page;
    });

    afterAll(async () => {
        await browser?.close();
    });

    it("keeps the scroll position when the file changes", async () => {
        const before = await page.evaluate(() => {
            const root = document.querySelector(".inline-md-root");
            if (!(root instanceof HTMLElement)) {
                return 0;
            }
            root.scrollTop = root.scrollHeight;
            return root.scrollTop;
        });
        expect(before).toBeGreaterThan(200);
        const next = sample.replace("The first paragraph stays at the top of the file.", "The first paragraph stays at the top of the file. Edited.");
        await page.evaluate((text) => {
            (window as unknown as { __inlineMarkdown: { setDocument(value: string): void } }).__inlineMarkdown.setDocument(text);
        }, next);
        await page.evaluate(() => new Promise((resolve) => {
            requestAnimationFrame(() => {
                requestAnimationFrame(() => resolve(undefined));
            });
        }));
        const after = await page.evaluate(() => {
            const root = document.querySelector(".inline-md-root");
            return root instanceof HTMLElement ? root.scrollTop : 0;
        });
        expect(Math.abs(after - before)).toBeLessThan(8);
    });
});
