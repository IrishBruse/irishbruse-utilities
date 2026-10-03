import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { bulletLines, expectLineRangeShot, openPlayground } from "../../support/browser";
import type { Browser, Page } from "playwright-core";

const here = dirname(fileURLToPath(import.meta.url));

describe("nested list bullets stay visible", () => {
    let browser: Browser;
    let page: Page;

    beforeAll(async () => {
        const opened = await openPlayground("list/fixtures/case-1.md");
        browser = opened.browser;
        page = opened.page;
    });

    afterAll(async () => {
        await browser?.close();
    });

    it("paints the nested bullet where the pointer lands", async () => {
        const [nested] = await bulletLines(page, ["Nested bullet"]);
        expect(nested?.hitIsBullet).toBe(true);
        expect(nested?.bulletRight).toBeGreaterThan(0);
    });

    it("matches the saved picture of the list", async () => {
        await expectLineRangeShot(page, join(here, "screenshots", "list.png"), {
            from: "Heading for color",
            to: "Nested ordered",
        });
    });
});

describe("task list label spacing", () => {
    let browser: Browser;
    let page: Page;

    beforeAll(async () => {
        const opened = await openPlayground("list/fixtures/case-2.md", "ask");
        browser = opened.browser;
        page = opened.page;
        await page.waitForFunction(() => document.querySelector(".inline-md-task") instanceof HTMLInputElement);
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
            return [...document.querySelectorAll("#editor .margin-view-overlays .inline-md-list-bullet")].some(
                (bullet) => Math.abs(bullet.getBoundingClientRect().top - top) <= 2,
            );
        });
        expect(bulletOnTaskLine).toBe(false);
    });

    it("keeps space between the checkbox and the label", async () => {
        const gap = await page.evaluate(() => {
            const fold = (value: string | null) => (value ?? "").replaceAll("\u00a0", " ");
            const checkbox = document.querySelector(".inline-md-task");
            if (!(checkbox instanceof HTMLElement)) {
                return null;
            }
            const top = checkbox.getBoundingClientRect().top;
            const line = [...document.querySelectorAll("#editor .view-line")].find((entry) => Math.abs(entry.getBoundingClientRect().top - top) <= 2);
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

    it("matches the saved picture of checkbox padding before the label", async () => {
        const clip = await expectLineRangeShot(page, join(here, "screenshots", "task-checkbox-padding.png"), {
            from: "ask",
            to: "ask",
            lineNumbers: false,
            pad: 8,
        });
        const covers = await page.evaluate((box) => {
            const checkbox = document.querySelector(".inline-md-task");
            if (!(checkbox instanceof HTMLElement)) {
                return false;
            }
            const checkboxTop = checkbox.getBoundingClientRect().top;
            const line = [...document.querySelectorAll("#editor .view-line")].find((entry) => Math.abs(entry.getBoundingClientRect().top - checkboxTop) <= 8);
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
            return checkboxBox.top >= box.y
                && checkboxBox.bottom <= bottom
                && checkboxBox.left >= box.x
                && labelBox.right <= right
                && labelBox.bottom <= bottom
                && labelBox.left > checkboxBox.right;
        }, clip);
        expect(covers).toBe(true);
        expect(clip.height).toBeLessThan(48);
    });
});
