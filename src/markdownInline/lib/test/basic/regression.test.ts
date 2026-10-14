import { afterAll, beforeAll, describe, expect, it } from "vite-plus/test";
import { openPlayground } from "../support/browser";
import type { Browser, Page } from "playwright-core";

describe("inline code raw background", () => {
    let browser: Browser;
    let page: Page;

    beforeAll(async () => {
        const opened = await openPlayground("test/basic/fixtures/case-7.md", "split me");
        browser = opened.browser;
        page = opened.page;
        await page.evaluate(() => {
            const api = (
                window as unknown as {
                    __inlineMarkdown: { focus(): void; setCursor(offset: number): void };
                }
            ).__inlineMarkdown;
            api.focus();
            api.setCursor(0);
        });
        await page.waitForFunction(() => {
            const fold = (value: string | null) => (value ?? "").replaceAll("\u00a0", " ");
            return [...document.querySelectorAll("#editor .view-line span")].some(
                (span) =>
                    span.childElementCount === 0 &&
                    span.classList.contains("inline-md-code") &&
                    fold(span.textContent) === "`split me`",
            );
        });
    }, 45_000);

    afterAll(async () => {
        await browser?.close();
    });

    it("keeps the backticks and words as one darkened code piece when raw is shown", async () => {
        const mark = await page.evaluate(() => {
            const fold = (value: string | null) => (value ?? "").replaceAll("\u00a0", " ");
            const span = [...document.querySelectorAll("#editor .view-line span")].find(
                (entry) =>
                    entry.childElementCount === 0 &&
                    entry.classList.contains("inline-md-code") &&
                    fold(entry.textContent) === "`split me`",
            );
            if (!(span instanceof HTMLElement)) {
                return null;
            }
            const style = getComputedStyle(span);
            return {
                text: fold(span.textContent),
                backgroundColor: style.backgroundColor,
                paddingLeft: style.paddingLeft,
                paddingRight: style.paddingRight,
            };
        });
        expect(mark).not.toBeNull();
        expect(mark!.text).toBe("`split me`");
        expect(mark!.backgroundColor).not.toBe("rgba(0, 0, 0, 0)");
        expect(mark!.paddingLeft).toBe("0px");
        expect(mark!.paddingRight).toBe("0px");
    });
});
