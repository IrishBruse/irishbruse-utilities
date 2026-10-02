import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, describe, it } from "vitest";
import { expectEditorShot, openPlayground } from "../../support/browser";
import type { Browser, Page } from "playwright-core";

const here = dirname(fileURLToPath(import.meta.url));
const fixture = "tables/fixtures/case-1.md";

describe("table layout", () => {
    let browser: Browser;
    let page: Page;

    beforeAll(async () => {
        const opened = await openPlayground(fixture, "Keep the caret");
        browser = opened.browser;
        page = opened.page;
        await page.evaluate(() => {
            const api = (window as unknown as {
                __inlineMarkdown: { getDocument(): string; setCursor(offset: number): void };
            }).__inlineMarkdown;
            const source = api.getDocument();
            api.setCursor(source.length);
        });
        await page.waitForFunction(() => document.querySelectorAll(".inline-md-table table").length >= 3);
    });

    afterAll(async () => {
        await browser?.close();
    });

    it("matches the saved picture of the formatted tables", async () => {
        await expectEditorShot(page, join(here, "screenshots", "tables.png"));
    });
});
