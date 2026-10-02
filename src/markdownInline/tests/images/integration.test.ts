import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { openPlayground } from "../../support/browser";
import type { Browser, Page } from "playwright-core";

const fixture = "images/fixtures/case-1.md";

async function showImages(page: Page): Promise<void> {
    await page.evaluate(() => {
        const api = (window as unknown as {
            __inlineMarkdown: { getDocument(): string; setCursor(offset: number): void };
        }).__inlineMarkdown;
        api.setCursor(api.getDocument().length);
    });
    await page.waitForFunction(() => {
        const image = document.querySelector("img.inline-md-image");
        if (!(image instanceof HTMLImageElement) || !image.complete || image.naturalWidth === 0) {
            return false;
        }
        const labels = [...document.querySelectorAll(".inline-md-image-fallback")].map((node) => node.textContent);
        return image.getBoundingClientRect().height >= 80 && labels.includes("Missing chart") && labels.includes("Image");
    });
}

describe("images", () => {
    let browser: Browser;
    let page: Page;

    beforeAll(async () => {
        const opened = await openPlayground(fixture, "Keep the caret");
        browser = opened.browser;
        page = opened.page;
        await showImages(page);
    });

    afterAll(async () => {
        await browser?.close();
    });

    it("shows the picture under the pointer and hides the address", async () => {
        const picture = await page.evaluate(() => {
            const image = document.querySelector("img.inline-md-image");
            if (!(image instanceof HTMLImageElement)) {
                return null;
            }
            const box = image.getBoundingClientRect();
            const hit = document.elementFromPoint(box.left + box.width / 2, box.top + box.height / 2);
            return {
                alt: image.alt,
                naturalWidth: image.naturalWidth,
                hitIsImage: hit instanceof Element && hit.closest(".inline-md-image") === image,
            };
        });
        const editor = (await page.locator("#editor .view-lines").innerText()).replaceAll("\u00a0", " ");
        expect(picture?.alt).toBe("Blue square");
        expect(picture?.naturalWidth).toBeGreaterThan(0);
        expect(picture?.hitIsImage).toBe(true);
        expect(editor).toContain("Images");
        expect(editor).toContain("Keep the caret here.");
        expect(editor).not.toContain("blue.png");
        expect(editor).not.toContain("![");
    });

    it("shows a missing image as italic alt text under the pointer", async () => {
        const missing = await page.evaluate(() => {
            const node = [...document.querySelectorAll(".inline-md-image-fallback")].find((entry) => entry.textContent === "Missing chart");
            if (!(node instanceof HTMLElement)) {
                return null;
            }
            const box = node.getBoundingClientRect();
            const hit = document.elementFromPoint(box.left + box.width / 2, box.top + box.height / 2);
            return {
                fontStyle: getComputedStyle(node).fontStyle,
                hitIsLabel: hit instanceof Element && hit.closest(".inline-md-image-fallback") === node,
            };
        });
        const editor = (await page.locator("#editor .view-lines").innerText()).replaceAll("\u00a0", " ");
        expect(missing?.fontStyle).toBe("italic");
        expect(missing?.hitIsLabel).toBe(true);
        expect(editor).not.toContain("missing.png");
    });

    it("shows Image when a missing image has no alt text", async () => {
        const blank = await page.evaluate(() => {
            const node = [...document.querySelectorAll(".inline-md-image-fallback")].find((entry) => entry.textContent === "Image");
            if (!(node instanceof HTMLElement)) {
                return null;
            }
            const box = node.getBoundingClientRect();
            const hit = document.elementFromPoint(box.left + box.width / 2, box.top + box.height / 2);
            return {
                fontStyle: getComputedStyle(node).fontStyle,
                hitIsLabel: hit instanceof Element && hit.closest(".inline-md-image-fallback") === node,
            };
        });
        const editor = (await page.locator("#editor .view-lines").innerText()).replaceAll("\u00a0", " ");
        expect(blank?.fontStyle).toBe("italic");
        expect(blank?.hitIsLabel).toBe(true);
        expect(editor).not.toContain("also-missing.png");
    });
});
