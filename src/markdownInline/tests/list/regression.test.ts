import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { bulletLines, expectEditorShot, openPlayground } from "../../support/browser";
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
        await expectEditorShot(page, join(here, "screenshots", "list.png"));
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

    it("keeps space between the checkbox and the label", async () => {
        const gap = await page.evaluate(() => {
            const fold = (value: string | null) => (value ?? "").replaceAll("\u00a0", " ");
            const checkbox = document.querySelector(".inline-md-task");
            const line = [...document.querySelectorAll("#editor .view-line")].find((entry) => fold(entry.textContent).includes("ask"));
            if (!(checkbox instanceof HTMLElement) || !(line instanceof HTMLElement)) {
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

    it("matches the saved picture of the task list item", async () => {
        await expectEditorShot(page, join(here, "screenshots", "task-list-label.png"));
    });
});
