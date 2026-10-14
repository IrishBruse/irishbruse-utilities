import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, describe, expect, it } from "vite-plus/test";
import { expectLineRangeShot, openPlayground } from "../../../../test/support/browser";
import type { Browser, Page } from "playwright-core";

const here = dirname(fileURLToPath(import.meta.url));
const fixture = "markdown/list/number/test/fixtures/case-4.md";

describe("list selection band", () => {
    let browser: Browser;
    let page: Page;

    beforeAll(async () => {
        const opened = await openPlayground(fixture, "Header shows");
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
            const paragraph = lines.find((line) =>
                fold(line.textContent).includes("Paragraph stays"),
            );
            const header = lines.find((line) => fold(line.textContent).includes("Header shows"));
            const edit = lines.find((line) => fold(line.textContent).includes("Edit name"));
            if (
                !(paragraph instanceof HTMLElement) ||
                !(header instanceof HTMLElement) ||
                !(edit instanceof HTMLElement)
            ) {
                return null;
            }
            const pieces = [...document.querySelectorAll<HTMLElement>(".selected-text")].filter(
                (piece) => piece.getBoundingClientRect().width > 12,
            );
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
