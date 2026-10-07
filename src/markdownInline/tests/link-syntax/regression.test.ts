import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { expectLineRangeShot, openPlayground } from "../support/browser";
import type { Browser, Page } from "playwright-core";

const here = dirname(fileURLToPath(import.meta.url));
const fixture = "link-syntax/fixtures/case-1.md";

const punctuation = "rgb(209, 154, 102)";
const label = "rgb(97, 175, 239)";
const path = "rgb(53, 168, 84)";

describe("link syntax colors", () => {
    let browser: Browser;
    let page: Page;

    beforeAll(async () => {
        const opened = await openPlayground(fixture, "Example link");
        browser = opened.browser;
        page = opened.page;
        await page.evaluate(() => {
            const api = (window as unknown as {
                __inlineMarkdown: { focus(): void; setCursor(offset: number): void };
            }).__inlineMarkdown;
            api.focus();
            api.setCursor(0);
        });
        await page.waitForFunction(() => {
            const fold = (value: string | null) => (value ?? "").replaceAll("\u00a0", " ");
            return [...document.querySelectorAll("#editor .view-line")].some((line) => fold(line.textContent).includes("https://example.com"));
        });
    }, 45_000);

    afterAll(async () => {
        await browser?.close();
    });

    it("paints tan brackets, a blue label, and a green underlined path", async () => {
        const spans = await page.evaluate(() => {
            const fold = (value: string | null) => (value ?? "").replaceAll("\u00a0", " ");
            const line = [...document.querySelectorAll("#editor .view-line")].find((entry) => fold(entry.textContent).includes("Example link"));
            return [...(line?.querySelectorAll("span") ?? [])]
                .filter((span) => span.childElementCount === 0)
                .map((span) => ({
                    text: fold(span.textContent),
                    color: getComputedStyle(span).color,
                    decoration: getComputedStyle(span).textDecorationLine,
                }));
        });
        const painted = (text: string) => spans.find((span) => span.text === text);
        expect(painted("[")).toMatchObject({ color: punctuation, decoration: "none" });
        expect(painted("]")).toMatchObject({ color: punctuation, decoration: "none" });
        expect(painted("(")).toMatchObject({ color: punctuation, decoration: "none" });
        expect(painted(")")).toMatchObject({ color: punctuation, decoration: "none" });
        expect(painted("Example link")).toMatchObject({ color: label, decoration: "none" });
        expect(painted("https://example.com")).toMatchObject({ color: path, decoration: "underline" });
    });

    it("shows the colored link syntax", async () => {
        await expectLineRangeShot(page, join(here, "screenshots/link-syntax.png"), {
            from: "Example link",
            to: "Example link",
        });
    });
});
