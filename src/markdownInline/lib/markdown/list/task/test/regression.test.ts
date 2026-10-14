import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, describe, expect, it } from "vite-plus/test";
import { expectLineRangeShot, openPlayground } from "../../../../test/support/browser";
import type { Browser, Page } from "playwright-core";

const here = dirname(fileURLToPath(import.meta.url));
const fixture = "markdown/list/task/test/fixtures/case-2.md";

describe("task list label spacing", () => {
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

    it("matches the saved picture of checkbox padding before the label", async () => {
        const clip = await expectLineRangeShot(
            page,
            join(here, "screenshots", "task-checkbox-padding.png"),
            {
                from: "ask",
                to: "ask",
                lineNumbers: false,
                pad: 8,
            },
        );
        const covers = await page.evaluate((box) => {
            const checkbox = document.querySelector(".inline-md-task");
            if (!(checkbox instanceof HTMLElement)) {
                return false;
            }
            const checkboxTop = checkbox.getBoundingClientRect().top;
            const line = [...document.querySelectorAll("#editor .view-line")].find(
                (entry) => Math.abs(entry.getBoundingClientRect().top - checkboxTop) <= 8,
            );
            const walker = line ? document.createTreeWalker(line, NodeFilter.SHOW_TEXT) : null;
            let labelBox: DOMRect | null = null;
            let node = walker?.nextNode() ?? null;
            while (node) {
                const text = node.textContent ?? "";
                const index = text.indexOf("ask");
                if (index >= 0) {
                    const range = document.createRange();
                    range.setStart(node, index);
                    range.setEnd(node, index + 3);
                    labelBox = range.getBoundingClientRect();
                    break;
                }
                node = walker?.nextNode() ?? null;
            }
            if (!labelBox) {
                return false;
            }
            const checkboxBox = checkbox.getBoundingClientRect();
            const right = box.x + box.width;
            const bottom = box.y + box.height;
            return (
                checkboxBox.top >= box.y &&
                checkboxBox.bottom <= bottom &&
                checkboxBox.left >= box.x &&
                labelBox.right <= right &&
                labelBox.bottom <= bottom &&
                labelBox.left > checkboxBox.right
            );
        }, clip);
        expect(covers).toBe(true);
        expect(clip.height).toBeLessThan(48);
    });
});
