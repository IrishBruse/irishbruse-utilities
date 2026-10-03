import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { openPlayground } from "../../support/browser";
import type { Browser, Page } from "playwright-core";

const fixture = "fence/fixtures/case-1.md";

describe("fenced code colors", () => {
    let browser: Browser;
    let page: Page;

    beforeAll(async () => {
        console.log("fence beforeAll");
        const opened = await openPlayground(fixture, "");
        browser = opened.browser;
        page = opened.page;
        const loaded = await page.evaluate(() => {
            const api = (window as unknown as { __inlineMarkdown?: { getDocument(): string } }).__inlineMarkdown;
            return api?.getDocument?.() ?? "";
        });
        if (!loaded.includes("Before the fence.")) {
            throw new Error(`Loaded the wrong document: ${loaded.slice(0, 120)}`);
        }
        await page.evaluate(() => {
            const api = (window as unknown as {
                __inlineMarkdown: { focus(): void; getDocument(): string; setCursor(offset: number): void };
            }).__inlineMarkdown;
            const source = api.getDocument();
            api.focus();
            api.setCursor(source.indexOf("```mermaid"));
        });
        await page.waitForFunction(() => {
            const fold = (value: string | null) => (value ?? "").replaceAll("\u00a0", " ");
            return [...document.querySelectorAll("#editor .view-line")].some((line) => fold(line.textContent).includes("```mermaid"));
        });
    }, 45_000);

    afterAll(async () => {
        await browser?.close();
    });

    it("paints the backticks in the editor text color and the language name in cyan", async () => {
        const colors = await page.evaluate(() => {
            const fold = (value: string | null) => (value ?? "").replaceAll("\u00a0", " ");
            const line = [...document.querySelectorAll("#editor .view-line")].find((entry) => fold(entry.textContent).includes("```mermaid"));
            const spans = [...(line?.querySelectorAll("span") ?? [])]
                .filter((span) => span.childElementCount === 0)
                .map((span) => ({ text: fold(span.textContent), color: getComputedStyle(span).color }));
            return spans;
        });
        const backticks = colors.find((span) => span.text === "```");
        const language = colors.find((span) => span.text === "mermaid");
        expect(backticks?.color).toBe("rgb(171, 178, 191)");
        expect(language?.color).toBe("rgb(86, 182, 194)");
    });
});
