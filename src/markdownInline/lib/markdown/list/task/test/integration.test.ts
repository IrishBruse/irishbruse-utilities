import { afterAll, beforeAll, describe, expect, it } from "vite-plus/test";
import { openPlayground } from "../../../../test/support/browser";
import type { Browser, Page } from "playwright-core";

const fixture = "markdown/list/task/test/fixtures/case-2.md";

describe("tasks", () => {
    let browser: Browser;
    let page: Page;

    beforeAll(async () => {
        const opened = await openPlayground(fixture, "ask");
        browser = opened.browser;
        page = opened.page;
        await page.waitForFunction(
            () => document.querySelector(".inline-md-task") instanceof HTMLInputElement,
        );
    });

    afterAll(async () => {
        await browser?.close();
    });

    it("does not paint a list bullet beside the checkbox", async () => {
        const bulletOnTaskLine = await page.evaluate(() => {
            const checkbox = document.querySelector(".inline-md-task");
            if (!(checkbox instanceof HTMLElement)) {
                return null;
            }
            const top = checkbox.getBoundingClientRect().top;
            return [
                ...document.querySelectorAll(
                    "#editor .inline-md-list-mark, #editor .margin-view-overlays .inline-md-list-bullet",
                ),
            ].some((bullet) => Math.abs(bullet.getBoundingClientRect().top - top) <= 2);
        });
        expect(bulletOnTaskLine).toBe(false);
    });

    it("keeps space between the checkbox and the label", async () => {
        const gap = await page.evaluate(() => {
            const checkbox = document.querySelector(".inline-md-task");
            if (!(checkbox instanceof HTMLElement)) {
                return null;
            }
            const top = checkbox.getBoundingClientRect().top;
            const line = [...document.querySelectorAll("#editor .view-line")].find(
                (entry) => Math.abs(entry.getBoundingClientRect().top - top) <= 2,
            );
            if (!(line instanceof HTMLElement)) {
                return null;
            }
            const walker = document.createTreeWalker(line, NodeFilter.SHOW_TEXT);
            let node: Node | null = walker.nextNode();
            while (node) {
                const text = node.textContent ?? "";
                const index = text.indexOf("ask");
                if (index >= 0) {
                    const range = document.createRange();
                    range.setStart(node, index);
                    range.setEnd(node, index + 3);
                    const labelLeft = range.getBoundingClientRect().left;
                    return labelLeft - checkbox.getBoundingClientRect().right;
                }
                node = walker.nextNode();
            }
            return null;
        });
        expect(gap).not.toBeNull();
        expect(gap).toBeGreaterThan(2);
    });
});
