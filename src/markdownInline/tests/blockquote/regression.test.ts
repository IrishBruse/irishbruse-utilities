import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { expectLineRangeShot, openPlayground } from "../../support/browser";
import type { Browser, Page } from "playwright-core";

const here = dirname(fileURLToPath(import.meta.url));
const fixture = "blockquote/fixtures/case-1.md";

describe("blockquote paint", () => {
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
        await page.waitForFunction(() => {
            const text = (document.querySelector("#editor .view-lines")?.textContent ?? "").replaceAll("\u00a0", " ");
            return text.includes("Quote line.") && document.querySelector(".inline-md-quote") instanceof HTMLElement;
        });
    });

    afterAll(async () => {
        await browser?.close();
    });

    it("leaves the editor background showing through the quote", async () => {
        const backgrounds = await page.evaluate(() => {
            return [...document.querySelectorAll(".inline-md-quote")].map((node) => getComputedStyle(node).backgroundColor);
        });
        expect(backgrounds.length).toBeGreaterThan(0);
        expect(backgrounds.every((color) => color === "rgba(0, 0, 0, 0)")).toBe(true);
    });

    it("paints ordinary quote text softer than the text outside the quote", async () => {
        const colors = await page.evaluate(() => {
            const fold = (value: string | null) => (value ?? "").replaceAll("\u00a0", " ");
            const colorOf = (needle: string) => {
                const line = [...document.querySelectorAll("#editor .view-line")].find((entry) => fold(entry.textContent).includes(needle));
                const span = [...(line?.querySelectorAll("span") ?? [])]
                    .filter((entry) => fold(entry.textContent).includes(needle))
                    .sort((left, right) => (left.textContent?.length ?? 0) - (right.textContent?.length ?? 0))[0];
                return span instanceof HTMLElement ? getComputedStyle(span).color : "";
            };
            const root = document.querySelector(".inline-md-root");
            const probe = document.createElement("span");
            probe.style.color = "color-mix(in srgb, var(--vscode-descriptionForeground) 60%, transparent)";
            root?.appendChild(probe);
            const faded = probe instanceof HTMLElement ? getComputedStyle(probe).color : "";
            probe.remove();
            return {
                outside: colorOf("Outside the quote"),
                quote: colorOf("Quote line."),
                faded,
            };
        });
        expect(colors.quote).toBe(colors.faded);
        expect(colors.quote).not.toBe(colors.outside);
    });

    it("matches the saved picture of a quote", async () => {
        const clip = await expectLineRangeShot(page, join(here, "screenshots", "blockquote.png"), {
            from: "Outside the quote",
            to: "Nested quote.",
        });
        expect(clip.width).toBeGreaterThan(40);
        expect(clip.height).toBeGreaterThan(40);
        expect(clip.width).toBeLessThan(500);
    });

    it("hides the quote bar while the quote mark is revealed", async () => {
        await page.evaluate(() => {
            const api = (window as unknown as {
                __inlineMarkdown: { getDocument(): string; setCursor(offset: number): void };
            }).__inlineMarkdown;
            const quote = api.getDocument().indexOf("> Quote line.");
            api.setCursor(quote + 1);
        });
        await page.waitForFunction(() => {
            const fold = (value: string | null) => (value ?? "").replaceAll("\u00a0", " ");
            const line = [...document.querySelectorAll("#editor .view-line")].find((entry) => fold(entry.textContent).includes("Quote line."));
            const marker = line instanceof HTMLElement
                ? [...line.querySelectorAll("span")].find((span) => fold(span.textContent) === ">")
                : undefined;
            return marker instanceof HTMLElement && getComputedStyle(marker).color !== "rgba(0, 0, 0, 0)";
        });
        const paint = await page.evaluate(() => {
            const fold = (value: string | null) => (value ?? "").replaceAll("\u00a0", " ");
            const lineFor = (needle: string) => [...document.querySelectorAll("#editor .view-line")].find((entry) => fold(entry.textContent).includes(needle));
            const barOn = (line: Element | undefined) => {
                if (!(line instanceof HTMLElement)) {
                    return false;
                }
                const top = line.getBoundingClientRect().top;
                return [...document.querySelectorAll(".inline-md-quote")].some((entry) => Math.abs(entry.getBoundingClientRect().top - top) <= 2);
            };
            const quote = lineFor("Quote line.");
            const marker = quote instanceof HTMLElement
                ? [...quote.querySelectorAll("span")].find((span) => fold(span.textContent) === ">")
                : undefined;
            return {
                revealed: fold(quote?.textContent ?? "").includes(">"),
                markerColor: marker instanceof HTMLElement ? getComputedStyle(marker).color : "",
                quoteBar: barOn(quote),
                nestedBar: barOn(lineFor("Nested quote.")),
            };
        });
        expect(paint.revealed).toBe(true);
        expect(paint.markerColor).not.toBe("rgba(0, 0, 0, 0)");
        expect(paint.quoteBar).toBe(false);
        expect(paint.nestedBar).toBe(true);
    });

    it("keeps the quote mark hidden when the caret is on the quote but not on the mark", async () => {
        await page.evaluate(() => {
            const api = (window as unknown as {
                __inlineMarkdown: { getDocument(): string; setCursor(offset: number): void };
            }).__inlineMarkdown;
            const quote = api.getDocument().indexOf("> Quote line.");
            api.setCursor(quote + "> Quote line.".length);
        });
        await page.waitForFunction(() => {
            const fold = (value: string | null) => (value ?? "").replaceAll("\u00a0", " ");
            const line = [...document.querySelectorAll("#editor .view-line")].find((entry) => fold(entry.textContent).includes("Quote line."));
            const marker = line instanceof HTMLElement
                ? [...line.querySelectorAll("span")].find((span) => fold(span.textContent) === ">")
                : undefined;
            return marker instanceof HTMLElement && getComputedStyle(marker).color === "rgba(0, 0, 0, 0)";
        });
        const paint = await page.evaluate(() => {
            const fold = (value: string | null) => (value ?? "").replaceAll("\u00a0", " ");
            const line = [...document.querySelectorAll("#editor .view-line")].find((entry) => fold(entry.textContent).includes("Quote line."));
            const marker = line instanceof HTMLElement
                ? [...line.querySelectorAll("span")].find((span) => fold(span.textContent) === ">")
                : undefined;
            const top = line instanceof HTMLElement ? line.getBoundingClientRect().top : -1;
            const bar = [...document.querySelectorAll(".inline-md-quote")].some((entry) => Math.abs(entry.getBoundingClientRect().top - top) <= 2);
            return {
                markerColor: marker instanceof HTMLElement ? getComputedStyle(marker).color : "",
                bar,
            };
        });
        expect(paint.markerColor).toBe("rgba(0, 0, 0, 0)");
        expect(paint.bar).toBe(true);
    });
});

describe("blockquote down into a quote", () => {
    let browser: Browser;
    let page: Page;

    beforeAll(async () => {
        const opened = await openPlayground("blockquote/fixtures/case-2.md", "Above the quote");
        browser = opened.browser;
        page = opened.page;
    });

    afterAll(async () => {
        await browser?.close();
    });

    it("moves down from the line above a quote into that quote and keeps the quote mark hidden", async () => {
        await page.evaluate(() => {
            const api = (window as unknown as {
                __inlineMarkdown: {
                    focus(): void;
                    getDocument(): string;
                    setCursor(offset: number): void;
                };
            }).__inlineMarkdown;
            const source = api.getDocument();
            const above = source.indexOf("Above the quote.");
            api.focus();
            api.setCursor(above + "Above the quote.".length);
        });
        await page.keyboard.press("ArrowDown");
        await page.keyboard.press("ArrowDown");
        await page.waitForFunction(() => {
            const api = (window as unknown as {
                __inlineMarkdown: { getCursor(): number; getDocument(): string };
            }).__inlineMarkdown;
            const source = api.getDocument();
            const offset = api.getCursor();
            const quote = source.indexOf("> Quote line.");
            return offset >= quote && offset <= quote + "> Quote line.".length;
        });
        const landed = await page.evaluate(() => {
            const api = (window as unknown as {
                __inlineMarkdown: { getCursor(): number; getDocument(): string };
            }).__inlineMarkdown;
            const source = api.getDocument();
            const offset = api.getCursor();
            const quote = source.indexOf("> Quote line.");
            const fold = (value: string | null) => (value ?? "").replaceAll("\u00a0", " ");
            const line = [...document.querySelectorAll("#editor .view-line")].find((entry) => fold(entry.textContent).includes("Quote line."));
            const marker = line instanceof HTMLElement
                ? [...line.querySelectorAll("span")].find((span) => fold(span.textContent) === ">")
                : undefined;
            return {
                onQuote: offset >= quote && offset <= quote + "> Quote line.".length,
                onMark: offset >= quote && offset < quote + "> ".length,
                markerClass: marker?.className ?? "",
                markerColor: marker instanceof HTMLElement ? getComputedStyle(marker).color : "",
            };
        });
        expect(landed.onQuote).toBe(true);
        expect(landed.onMark).toBe(false);
        expect(landed.markerClass).toContain("inline-md-quote-marker");
        expect(landed.markerColor).toBe("rgba(0, 0, 0, 0)");
        await page.keyboard.type("!");
        const edited = await page.evaluate(() => {
            return (window as unknown as { __inlineMarkdown: { getDocument(): string } }).__inlineMarkdown.getDocument();
        });
        expect(edited).toContain("> Quote line.!");
    });
});
