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

    it("keeps formatted tables inside the page on a long document", async () => {
        const tableRows = Array.from(
            { length: 12 },
            (_, index) => `| cell ${index} a | cell ${index} b |`,
        );
        const table = ["| Col A | Col B |", "| --- | --- |", ...tableRows].join("\n");
        const prefix = Array.from({ length: 2400 }, (_, index) => `Line ${index + 1}`).join("\n");
        const gap = Array.from({ length: 8 }, (_, index) => `Gap ${index + 1}`).join("\n");
        const text = `${prefix}\n${gap}\n${table}\n`;
        const cursorOffset = text.indexOf("\nGap 1\n") + 1;

        await page.evaluate((value) => {
            (
                window as unknown as { __inlineMarkdown: { setDocument(next: string): void } }
            ).__inlineMarkdown.setDocument(value);
        }, text);
        await page.evaluate(
            () =>
                new Promise((resolve) => {
                    requestAnimationFrame(() => {
                        requestAnimationFrame(() => {
                            requestAnimationFrame(() => resolve(undefined));
                        });
                    });
                }),
        );
        await page.evaluate((offset) => {
            (
                window as unknown as {
                    __inlineMarkdown: { setCursor(offset: number): void };
                }
            ).__inlineMarkdown.setCursor(offset);
        }, cursorOffset);
        await page.evaluate(
            () =>
                new Promise((resolve) => {
                    setTimeout(resolve, 250);
                }),
        );

        const result = await page.evaluate(() => {
            const root = document.querySelector(".inline-md-root");
            const column = document.querySelector(".inline-md-column");
            const scrollbar = document.querySelector(".inline-md-screen-scroll");
            if (!(root instanceof HTMLElement) || !(column instanceof HTMLElement)) {
                return {
                    columnHeight: 0,
                    rootClientHeight: 0,
                    rootScrollHeight: 0,
                    scrollbarDisplay: "missing",
                    tableCellInView: false,
                    rawSeparatorVisible: false,
                };
            }
            const rootRect = root.getBoundingClientRect();
            let tableCellInView = false;
            for (const cell of root.querySelectorAll(".inline-md-table td, .inline-md-table th")) {
                if (!(cell instanceof HTMLElement)) {
                    continue;
                }
                const rect = cell.getBoundingClientRect();
                if (rect.bottom >= rootRect.top && rect.top <= rootRect.bottom) {
                    tableCellInView = true;
                    break;
                }
            }
            return {
                columnHeight: column.clientHeight,
                rootClientHeight: root.clientHeight,
                rootScrollHeight: root.scrollHeight,
                scrollbarDisplay:
                    scrollbar instanceof HTMLElement
                        ? getComputedStyle(scrollbar).display
                        : "missing",
                tableCellInView,
            };
        });

        expect(result.columnHeight).toBeGreaterThan(200);
        expect(result.columnHeight).toBeLessThanOrEqual(result.rootClientHeight + 2);
        expect(result.rootScrollHeight).toBeLessThanOrEqual(result.rootClientHeight + 2);
        expect(result.scrollbarDisplay).not.toBe("none");
        expect(result.tableCellInView).toBe(true);
    });

    it("keeps the vertical scrollbar on the right side of the screen", async () => {
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

        const place = await page.evaluate(() => {
            const root = document.querySelector(".inline-md-root");
            if (!(root instanceof HTMLElement)) {
                return { rightGap: -1, monacoDisplay: "missing", linesTop: "" };
            }
            const bars = [
                ...root.querySelectorAll(
                    ".inline-md-screen-scroll, .monaco-scrollable-element > .scrollbar.vertical",
                ),
            ];
            const visible = bars.find((node) => {
                if (!(node instanceof HTMLElement)) {
                    return false;
                }
                const style = getComputedStyle(node);
                if (style.display === "none" || style.visibility === "hidden") {
                    return false;
                }
                const rect = node.getBoundingClientRect();
                return rect.width > 2 && rect.height > 20;
            });
            const monaco = root.querySelector(".monaco-scrollable-element > .scrollbar.vertical");
            const rootRight = root.getBoundingClientRect().right;
            const barRight =
                visible instanceof HTMLElement ? visible.getBoundingClientRect().right : rootRight;
            const screenScroll = root.querySelector(".inline-md-screen-scroll");
            const spacer = root.querySelector(".inline-md-screen-scroll-spacer");
            if (screenScroll instanceof HTMLElement) {
                screenScroll.scrollTop = 480;
            }
            const lines = root.querySelector(".lines-content");
            return {
                rightGap: rootRight - barRight,
                monacoDisplay:
                    monaco instanceof HTMLElement ? getComputedStyle(monaco).display : "missing",
                linesTop: lines instanceof HTMLElement ? lines.style.top : "",
                track: spacer instanceof HTMLElement ? spacer.offsetHeight : 0,
            };
        });
        await page.evaluate(
            () =>
                new Promise((resolve) => {
                    requestAnimationFrame(() => resolve(undefined));
                }),
        );
        const linesTop = await page.evaluate(() => {
            const lines = document.querySelector(".inline-md-root .lines-content");
            return lines instanceof HTMLElement ? lines.style.top : "";
        });

        expect(place.monacoDisplay).toBe("none");
        expect(place.rightGap).toBeLessThanOrEqual(2);
        expect(place.track).toBeGreaterThan(0);
        expect(place.track).toBeLessThanOrEqual(20000);
        const top = Number.parseFloat(linesTop === "" ? place.linesTop : linesTop);
        expect(top).toBeLessThan(-100);
    });
});
