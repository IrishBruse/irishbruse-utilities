import { afterAll, beforeAll, describe, expect, it } from "vite-plus/test";
import { openPlayground } from "../../../../test/support/browser";
import type { Browser, Page } from "playwright-core";

const fixture = "markdown/list/number/test/fixtures/case-1.md";

describe("numbered lists", () => {
    let browser: Browser;
    let page: Page;

    beforeAll(async () => {
        const opened = await openPlayground(fixture);
        browser = opened.browser;
        page = opened.page;
    });

    afterAll(async () => {
        await browser?.close();
    });

    it("keeps numbers visible on a numbered list", async () => {
        const text = (await page.locator("#editor .view-lines").innerText()).replaceAll(
            "\u00a0",
            " ",
        );
        expect(text).toContain("1. Ordered one");
        expect(text).toContain("1. Nested ordered");
    });
});
