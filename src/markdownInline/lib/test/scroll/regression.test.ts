import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, describe, expect, it } from "vite-plus/test";
import { openPlayground } from "../support/browser";
import type { Browser, Page } from "playwright-core";

const sample = readFileSync(
    join(dirname(fileURLToPath(import.meta.url)), "fixtures", "case-1.md"),
    "utf8",
);

describe("scroll", () => {
    let browser: Browser;
    let page: Page;

    beforeAll(async () => {
        const opened = await openPlayground("test/scroll/fixtures/case-1.md", "Scroll sample");
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
        const next = sample.replace(
            "The first paragraph stays at the top of the file.",
            "The first paragraph stays at the top of the file. Edited.",
        );
        await page.evaluate((text) => {
            (
                window as unknown as { __inlineMarkdown: { setDocument(value: string): void } }
            ).__inlineMarkdown.setDocument(text);
        }, next);
        await page.evaluate(
            () =>
                new Promise((resolve) => {
                    requestAnimationFrame(() => {
                        requestAnimationFrame(() => resolve(undefined));
                    });
                }),
        );
        const after = await page.evaluate(() => {
            const root = document.querySelector(".inline-md-root");
            return root instanceof HTMLElement ? root.scrollTop : 0;
        });
        expect(Math.abs(after - before)).toBeLessThan(8);
    });

    it("keeps a long document inside the visible page", async () => {
        const text = Array.from({ length: 2500 }, (_, index) => `Line ${index + 1}`).join("\n");
        await page.evaluate((value) => {
            (
                window as unknown as { __inlineMarkdown: { setDocument(next: string): void } }
            ).__inlineMarkdown.setDocument(value);
        }, text);
        await page.evaluate(
            () =>
                new Promise((resolve) => {
                    requestAnimationFrame(() => {
                        requestAnimationFrame(() => resolve(undefined));
                    });
                }),
        );
        const box = await page.evaluate(() => {
            const root = document.querySelector(".inline-md-root");
            const column = document.querySelector(".inline-md-column");
            const editor = document.querySelector(".inline-md-column .monaco-editor");
            if (
                !(root instanceof HTMLElement) ||
                !(column instanceof HTMLElement) ||
                !(editor instanceof HTMLElement)
            ) {
                return { root: 0, column: 0, editor: 0 };
            }
            return {
                root: root.clientHeight,
                column: column.clientHeight,
                editor: editor.clientHeight,
            };
        });
        expect(box.column).toBeGreaterThan(200);
        expect(box.column).toBeLessThanOrEqual(box.root + 2);
        expect(box.editor).toBeGreaterThan(200);
        expect(box.editor).toBeLessThanOrEqual(box.root + 2);
        const lastLine = "Line 2500";
        const lastLineOffset = text.lastIndexOf(lastLine);
        await page.evaluate((offset) => {
            (
                window as unknown as {
                    __inlineMarkdown: { setCursor(offset: number): void };
                }
            ).__inlineMarkdown.setCursor(offset);
        }, lastLineOffset);
        await page.evaluate(
            () =>
                new Promise((resolve) => {
                    requestAnimationFrame(() => {
                        requestAnimationFrame(() => resolve(undefined));
                    });
                }),
        );
        const visibleLastLine = await page.evaluate((line) => {
            const root = document.querySelector(".inline-md-root");
            if (!(root instanceof HTMLElement)) {
                return false;
            }
            const rect = root.getBoundingClientRect();
            const lines = root.querySelectorAll(".view-line");
            for (const node of lines) {
                if (!(node instanceof HTMLElement)) {
                    continue;
                }
                const text = (node.textContent ?? "").replaceAll("\u00a0", " ");
                if (!text.includes(line)) {
                    continue;
                }
                const lineRect = node.getBoundingClientRect();
                if (lineRect.bottom >= rect.top && lineRect.top <= rect.bottom) {
                    return true;
                }
            }
            return false;
        }, lastLine);
        expect(visibleLastLine).toBe(true);
    });
});
