import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { bulletLines, expectLineRangeShot, openPlayground } from "../support/browser";
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

describe("list bullet column", () => {
    let browser: Browser;
    let page: Page;

    beforeAll(async () => {
        const opened = await openPlayground("list/fixtures/case-3.md", "keeps reveal");
        browser = opened.browser;
        page = opened.page;
    });

    afterAll(async () => {
        await browser?.close();
    });

    it("paints the bullet on the raw dash, outside the gutter", async () => {
        const placed = await page.evaluate(() => {
            const fold = (value: string | null) => (value ?? "").replaceAll("\u00a0", " ");
            const line = [...document.querySelectorAll("#editor .view-line")].find((entry) => fold(entry.textContent).includes("keeps reveal"));
            if (!(line instanceof HTMLElement)) {
                return null;
            }
            const lineBox = line.getBoundingClientRect();
            const bullet = [...line.querySelectorAll(".inline-md-list-mark")].find((entry) => entry.childElementCount === 0);
            const number = [...document.querySelectorAll("#editor .line-numbers")].find((entry) => {
                return Math.abs(entry.getBoundingClientRect().top - lineBox.top) <= 2;
            });
            if (!(bullet instanceof HTMLElement) || !(number instanceof HTMLElement)) {
                return null;
            }
            const bulletBox = bullet.getBoundingClientRect();
            return {
                bulletLeft: bulletBox.left,
                lineLeft: lineBox.left,
                numberRight: number.getBoundingClientRect().right,
            };
        });
        expect(placed).not.toBeNull();
        expect(placed!.bulletLeft).toBeGreaterThan(placed!.numberRight - 1);
        expect(Math.abs(placed!.bulletLeft - placed!.lineLeft)).toBeLessThanOrEqual(1);
    });

    it("shows a bullet before the label", async () => {
        const seen = await page.evaluate(() => {
            const fold = (value: string | null) => (value ?? "").replaceAll("\u00a0", " ");
            const line = [...document.querySelectorAll("#editor .view-line")].find((entry) => fold(entry.textContent).includes("keeps reveal"));
            if (!(line instanceof HTMLElement)) {
                return null;
            }
            const label = [...line.querySelectorAll("span")].find((span) => fold(span.textContent).startsWith("Change"));
            const bullet = [...line.querySelectorAll(".inline-md-list-mark")].find((span) => span.childElementCount === 0);
            const number = [...document.querySelectorAll("#editor .line-numbers")].find((entry) => {
                return Math.abs(entry.getBoundingClientRect().top - line.getBoundingClientRect().top) <= 2;
            });
            if (!(label instanceof HTMLElement) || !(bullet instanceof HTMLElement) || !(number instanceof HTMLElement)) {
                return null;
            }
            const bulletBox = bullet.getBoundingClientRect();
            return {
                bulletLeft: bulletBox.left,
                bulletRight: bulletBox.right,
                labelLeft: label.getBoundingClientRect().left,
                numberRight: number.getBoundingClientRect().right,
            };
        });
        expect(seen).not.toBeNull();
        expect(seen!.bulletLeft).toBeGreaterThan(seen!.numberRight - 1);
        expect(seen!.labelLeft).toBeGreaterThanOrEqual(seen!.bulletRight - 1);
    });

    it("matches the saved picture of the bullet on the dash column", async () => {
        await expectLineRangeShot(page, join(here, "screenshots", "bullet-on-dash.png"), {
            from: "keeps reveal",
            to: "modules",
        });
    });
});

describe("list selection band", () => {
    let browser: Browser;
    let page: Page;

    beforeAll(async () => {
        const opened = await openPlayground("list/fixtures/case-4.md", "Header shows");
        browser = opened.browser;
        page = opened.page;
    });

    afterAll(async () => {
        await browser?.close();
    });

    it("keeps the list font at paragraph size and joins the selection across the gap", async () => {
        const band = await page.evaluate(async () => {
            const api = window.__inlineMarkdown;
            const doc = api.getDocument();
            const from = doc.indexOf("1. Header");
            const to = doc.indexOf("description") + "description".length;
            api.select(from, to);
            await new Promise((resolve) => {
                requestAnimationFrame(() => requestAnimationFrame(resolve));
            });
            const fold = (value: string | null) => (value ?? "").replaceAll("\u00a0", " ");
            const lines = [...document.querySelectorAll<HTMLElement>("#editor .view-line")];
            const paragraph = lines.find((line) => fold(line.textContent).includes("Paragraph stays"));
            const header = lines.find((line) => fold(line.textContent).includes("Header shows"));
            const edit = lines.find((line) => fold(line.textContent).includes("Edit name"));
            if (!(paragraph instanceof HTMLElement) || !(header instanceof HTMLElement) || !(edit instanceof HTMLElement)) {
                return null;
            }
            const pieces = [...document.querySelectorAll<HTMLElement>(".selected-text")].filter((piece) => piece.getBoundingClientRect().width > 12);
            const cover = (line: HTMLElement) => {
                const bounds = line.getBoundingClientRect();
                const onLine = pieces.filter((piece) => {
                    const rect = piece.getBoundingClientRect();
                    return rect.bottom > bounds.top + 0.5 && rect.top < bounds.bottom - 0.5;
                });
                if (onLine.length === 0) {
                    return null;
                }
                const tops = onLine.map((piece) => piece.getBoundingClientRect().top);
                const bottoms = onLine.map((piece) => piece.getBoundingClientRect().bottom);
                return { top: Math.min(...tops), bottom: Math.max(...bottoms) };
            };
            const headerBand = cover(header);
            const editBand = cover(edit);
            if (!headerBand || !editBand) {
                return null;
            }
            return {
                gap: editBand.top - headerBand.bottom,
                listFont: getComputedStyle(header).fontSize,
                bodyFont: getComputedStyle(paragraph).fontSize,
                listHeight: header.getBoundingClientRect().height,
                bodyHeight: paragraph.getBoundingClientRect().height,
            };
        });
        expect(band).not.toBeNull();
        expect(band!.listFont).toBe(band!.bodyFont);
        expect(band!.gap).toBeLessThanOrEqual(1);
        expect(band!.listHeight).toBeGreaterThan(band!.bodyHeight);
        await expectLineRangeShot(page, join(here, "screenshots", "list-selection-band.png"), {
            from: "Header shows",
            to: "Edit name",
            lineNumbers: true,
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
            return [...document.querySelectorAll("#editor .inline-md-list-mark, #editor .margin-view-overlays .inline-md-list-bullet")].some(
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
