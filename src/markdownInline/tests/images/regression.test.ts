import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { expectEditorShot, openPlayground } from "../../support/browser";
import type { Browser, Page } from "playwright-core";

const here = dirname(fileURLToPath(import.meta.url));
const fixture = "images/fixtures/case-1.md";

describe("image layout", () => {
    let browser: Browser;
    let page: Page;

    beforeAll(async () => {
        const opened = await openPlayground(fixture, "Keep the caret");
        browser = opened.browser;
        page = opened.page;
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
    });

    afterAll(async () => {
        await browser?.close();
    });

    it("keeps a missing image below the picture", async () => {
        const boxes = await page.evaluate(() => {
            const image = document.querySelector("img.inline-md-image");
            const missing = [...document.querySelectorAll(".inline-md-image-fallback")].find((node) => node.textContent === "Missing chart");
            if (!(image instanceof HTMLElement) || !(missing instanceof HTMLElement)) {
                return null;
            }
            const picture = image.getBoundingClientRect();
            const label = missing.getBoundingClientRect();
            return { pictureBottom: picture.bottom, labelTop: label.top };
        });
        expect(boxes?.labelTop).toBeGreaterThanOrEqual((boxes?.pictureBottom ?? 0) - 1);
    });

    it("matches the saved picture of images and missing images", async () => {
        await expectEditorShot(page, join(here, "screenshots", "images.png"));
    });
});
