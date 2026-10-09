import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { openPlayground } from "../support/browser";
import type { Browser, Page } from "playwright-core";

const fixture = "tables/fixtures/case-1.md";

async function caretOutsideTables(page: Page): Promise<void> {
    await page.evaluate(() => {
        const api = (window as unknown as {
            __inlineMarkdown: { getDocument(): string; setCursor(offset: number): void };
        }).__inlineMarkdown;
        const source = api.getDocument();
        api.setCursor(source.length);
    });
    await page.waitForFunction(() => document.querySelectorAll(".inline-md-table table").length >= 3);
}

describe("tables", () => {
    let browser: Browser;
    let page: Page;

    beforeAll(async () => {
        const opened = await openPlayground(fixture, "Keep the caret");
        browser = opened.browser;
        page = opened.page;
        await caretOutsideTables(page);
    });

    afterAll(async () => {
        await browser?.close();
    });

    it("formats inline marks in the section heading", async () => {
        const heading = await page.evaluate(() => {
            const fold = (value: string | null) => (value ?? "").replaceAll("\u00a0", " ");
            const line = [...document.querySelectorAll("#editor .view-line")].find((entry) => fold(entry.textContent).includes("Tables:"));
            if (!line) {
                return null;
            }
            return {
                text: fold(line instanceof HTMLElement ? line.innerText : line.textContent),
                bold: fold(line.querySelector(".inline-md-strong")?.textContent ?? null),
                em: fold(line.querySelector(".inline-md-em")?.textContent ?? null),
                code: fold(line.querySelector(".inline-md-code")?.textContent ?? null),
                strike: fold(line.querySelector(".inline-md-strike")?.textContent ?? null),
            };
        });
        const editor = (await page.locator("#editor .view-lines").innerText()).replaceAll("\u00a0", " ");
        expect(editor).toContain("Tables:");
        expect(heading?.text).not.toContain("##");
        expect(heading?.text).not.toContain("**");
        expect(heading?.bold).toBe("bold");
        expect(heading?.em).toBe("italic");
        expect(heading?.code).toBe("code");
        expect(heading?.strike).toBe("strike");
    });

    it("renders each table as a header row and body rows", async () => {
        expect(await page.locator(".inline-md-table table").count()).toBe(3);
        expect(await page.locator(".inline-md-table thead .inline-md-strong").allInnerTexts()).toEqual(
            expect.arrayContaining(["Fruit", "Case", "Name"]),
        );
        expect(await page.locator(".inline-md-table thead .inline-md-em").allInnerTexts()).toEqual(
            expect.arrayContaining(["Qty", "Source hint", "Note"]),
        );
        expect(await page.locator(".inline-md-table thead .inline-md-code").innerText()).toBe("Expected");
        const cells = await page.locator(".inline-md-table tbody td").allInnerTexts();
        expect(cells).toEqual(expect.arrayContaining(["Apple", "Pear", "Mid-sentence"]));
    });

    it("formats inline marks inside body cells", async () => {
        const body = page.locator(".inline-md-table tbody");
        expect(await body.locator(".inline-md-strong").innerText()).toBe("Bold cell");
        expect(await body.locator(".inline-md-em").innerText()).toBe("Italic cell");
        const codes = await body.locator(".inline-md-code").allInnerTexts();
        expect(codes).toEqual(expect.arrayContaining(["word word", "code cell"]));
    });

    it("covers pipe source while the caret is outside the tables", async () => {
        const text = (await page.locator("#editor .view-lines").innerText()).replaceAll("\u00a0", " ");
        expect(text).toContain("Keep the caret here while reading.");
        expect(text).toContain("Apple");
        const covered = await page.evaluate(() => {
            const fold = (value: string | null) => (value ?? "").replaceAll("\u00a0", " ");
            const line = [...document.querySelectorAll("#editor .view-line")].find((entry) => fold(entry.textContent).includes("Apple"));
            const box = line?.getBoundingClientRect();
            if (!box || box.height <= 0) {
                return false;
            }
            const hit = document.elementFromPoint(box.left + 28, box.top + box.height / 2);
            return (hit?.closest(".inline-md-table") ?? null) !== null;
        });
        expect(covered).toBe(true);
    });
});
