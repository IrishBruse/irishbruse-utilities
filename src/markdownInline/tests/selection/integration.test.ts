import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { openPlayground } from "../../support/browser";
import type { Browser, Page } from "playwright-core";

async function editorText(page: Page): Promise<string> {
    return page.evaluate(() => {
        const fold = (value: string | null) => (value ?? "").replaceAll("\u00a0", " ");
        const view = document.querySelector("#editor .view-lines");
        return fold(view instanceof HTMLElement ? view.innerText : "");
    });
}

async function moveCaret(page: Page, offset: number): Promise<void> {
    await page.evaluate((at) => {
        window.__inlineMarkdown.setCursor(at);
    }, offset);
}

async function selectRange(page: Page, from: number, to: number): Promise<void> {
    await page.evaluate(({ from, to }) => {
        const handle = window.__inlineMarkdown;
        if (from === to) {
            handle.setCursor(from);
            return;
        }
        handle.select(from, to);
    }, { from, to });
}

describe("selection/fixtures/case-1.md", () => {
    let browser: Browser;
    let page: Page;
    let source: string;

    beforeAll(async () => {
        const opened = await openPlayground("selection/fixtures/case-1.md", "Second paragraph");
        browser = opened.browser;
        page = opened.page;
        source = await page.evaluate(() => window.__inlineMarkdown.getDocument());
        await moveCaret(page, source.length);
        await page.waitForFunction(() => {
            const fold = (value: string | null) => (value ?? "").replaceAll("\u00a0", " ");
            const view = document.querySelector("#editor .view-lines");
            const text = fold(view instanceof HTMLElement ? view.innerText : "");
            return text.includes("Second paragraph") && !text.includes("#");
        });
    });

    afterAll(async () => {
        await browser?.close();
    });

    it("hides the heading hash while the caret sits on the last line", async () => {
        const text = await editorText(page);
        expect(text).toContain("Main title");
        expect(text).toContain("Second paragraph keeps the caret away from the heading.");
        expect(text).not.toContain("#");
    });

    it("shows the heading hash when the selection covers the title and both paragraphs", async () => {
        await selectRange(page, 0, source.length);
        await page.waitForFunction(() => {
            const fold = (value: string | null) => (value ?? "").replaceAll("\u00a0", " ");
            const view = document.querySelector("#editor .view-lines");
            return fold(view instanceof HTMLElement ? view.innerText : "").includes("# Main title");
        });
        const text = await editorText(page);
        expect(text).toContain("# Main title");
        expect(text).toContain("First paragraph under the title.");
    });
});

describe("selection/fixtures/case-2.md", () => {
    let browser: Browser;
    let page: Page;
    let source: string;

    beforeAll(async () => {
        const opened = await openPlayground("selection/fixtures/case-2.md", "bold");
        browser = opened.browser;
        page = opened.page;
        source = await page.evaluate(() => window.__inlineMarkdown.getDocument());
        await moveCaret(page, source.length);
        await page.waitForFunction(() => {
            const fold = (value: string | null) => (value ?? "").replaceAll("\u00a0", " ");
            const view = document.querySelector("#editor .view-lines");
            const text = fold(view instanceof HTMLElement ? view.innerText : "");
            return text === "A bold word in a sentence.";
        });
    });

    afterAll(async () => {
        await browser?.close();
    });

    it("hides bold markers while the caret sits after the sentence", async () => {
        expect(await editorText(page)).toBe("A bold word in a sentence.");
    });

    it("shows bold markers when the selection covers the whole sentence", async () => {
        await selectRange(page, 0, source.length);
        await page.waitForFunction(() => {
            const fold = (value: string | null) => (value ?? "").replaceAll("\u00a0", " ");
            const view = document.querySelector("#editor .view-lines");
            return fold(view instanceof HTMLElement ? view.innerText : "").includes("**bold**");
        });
        expect(await editorText(page)).toBe("A **bold** word in a sentence.");
    });
});
