import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { expectLineRangeShot, openPlayground } from "../../support/browser";
import type { Browser, Page } from "playwright-core";

const here = dirname(fileURLToPath(import.meta.url));
const fixture = "fence/fixtures/case-1.md";

describe("fenced code colors", () => {
    let browser: Browser;
    let page: Page;

    beforeAll(async () => {
        const opened = await openPlayground(fixture, "Before the fence.");
        browser = opened.browser;
        page = opened.page;
        await page.evaluate(() => {
            const api = (window as unknown as {
                __inlineMarkdown: { focus(): void; getDocument(): string; setCursor(offset: number): void };
            }).__inlineMarkdown;
            const source = api.getDocument();
            api.focus();
            api.setCursor(source.indexOf("flowchart"));
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
        expect(colors.filter((span) => span.text.includes("`") || span.text.includes("mermaid"))).toEqual([
            { text: "```", color: "rgb(171, 178, 191)" },
            { text: "mermaid", color: "rgb(86, 182, 194)" },
        ]);
        const closing = await page.evaluate(() => {
            const fold = (value: string | null) => (value ?? "").replaceAll("\u00a0", " ");
            const line = [...document.querySelectorAll("#editor .view-line")].find((entry) => fold(entry.textContent).trim() === "```");
            const span = [...(line?.querySelectorAll("span") ?? [])].find((entry) => entry.childElementCount === 0 && fold(entry.textContent) === "```");
            return span ? getComputedStyle(span).color : "";
        });
        expect(closing).toBe("rgb(171, 178, 191)");
    });

    it("shows the opening and closing fences", async () => {
        await expectLineRangeShot(page, join(here, "screenshots/fence.png"), { from: "```mermaid", to: "```" });
    });
});
