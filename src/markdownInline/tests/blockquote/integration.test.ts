import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { openPlayground } from "../../support/browser";
import type { Browser, Page } from "playwright-core";

const fixture = "blockquote/fixtures/case-1.md";

describe("blockquotes", () => {
    let browser: Browser;
    let page: Page;

    beforeAll(async () => {
        const opened = await openPlayground(fixture, "Outside the quote");
        browser = opened.browser;
        page = opened.page;
        await page.evaluate(() => {
            const api = (window as unknown as {
                __inlineMarkdown: { setCursor(offset: number): void };
            }).__inlineMarkdown;
            api.setCursor(0);
        });
        await page.waitForFunction(() => document.querySelector(".inline-md-quote-depth-2") instanceof HTMLElement);
    });

    afterAll(async () => {
        await browser?.close();
    });

    it("keeps the quote words visible and the quote marks hidden", async () => {
        const shown = await page.evaluate(() => {
            const fold = (value: string | null) => (value ?? "").replaceAll("\u00a0", " ");
            const text = fold(document.querySelector("#editor .view-lines")?.textContent ?? "");
            const marker = document.querySelector(".inline-md-quote-marker");
            const markerColor = marker instanceof HTMLElement ? getComputedStyle(marker).color : "";
            return {
                text,
                markerColor,
            };
        });
        expect(shown.text).toContain("Quote line.");
        expect(shown.text).toContain("Nested quote.");
        expect(shown.markerColor).toBe("rgba(0, 0, 0, 0)");
    });

    it("puts a bar on the left of a quote and a second bar on a nested quote", async () => {
        const bars = await page.evaluate(() => {
            const fold = (value: string | null) => (value ?? "").replaceAll("\u00a0", " ");
            const line = [...document.querySelectorAll("#editor .view-line")].find((entry) => fold(entry.textContent).includes("Quote line."));
            const nested = [...document.querySelectorAll("#editor .view-line")].find((entry) => fold(entry.textContent).includes("Nested quote."));
            const barFor = (view: Element | undefined, depth: string) => {
                if (!(view instanceof HTMLElement)) {
                    return null;
                }
                const top = view.getBoundingClientRect().top;
                const mark = [...document.querySelectorAll(`.inline-md-quote-${depth}`)].find((entry) => {
                    return Math.abs(entry.getBoundingClientRect().top - top) <= 2;
                });
                if (!(mark instanceof HTMLElement)) {
                    return null;
                }
                const word = [...view.querySelectorAll("span")]
                    .filter((span) => fold(span.textContent).includes(depth === "depth-1" ? "Quote line." : "Nested quote."))
                    .sort((left, right) => (left.textContent?.length ?? 0) - (right.textContent?.length ?? 0))[0];
                const box = mark.getBoundingClientRect();
                const wordBox = word?.getBoundingClientRect();
                const barHit = document.elementsFromPoint(box.left + 2, box.top + box.height / 2);
                const wordHit = wordBox
                    ? document.elementFromPoint(wordBox.left + 2, wordBox.top + wordBox.height / 2)
                    : null;
                return {
                    image: getComputedStyle(mark).backgroundImage,
                    wordLeft: wordBox?.left ?? 0,
                    barLeft: box.left,
                    hitIsBar: barHit.some((entry) => entry.classList.contains(`inline-md-quote-${depth}`)),
                    wordIsQuote: wordHit instanceof Element && wordHit.classList.contains("inline-md-quote-text"),
                };
            };
            return {
                quote: barFor(line, "depth-1"),
                nested: barFor(nested, "depth-2"),
            };
        });
        expect(bars.quote?.image).toContain("linear-gradient");
        expect(bars.quote?.image).not.toContain("11px");
        expect(bars.quote?.hitIsBar).toBe(true);
        expect(bars.quote?.wordIsQuote).toBe(true);
        expect(bars.quote && bars.quote.wordLeft).toBeGreaterThan((bars.quote?.barLeft ?? 0) + 2);
        expect(bars.nested?.image).toContain("11px");
        expect(bars.nested?.image).toContain("14px");
    });
});
