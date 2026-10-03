import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { expectPageClip, featureClip, openPlayground } from "../../support/browser";
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
        const clip = await featureClip(page, { from: "Images", to: "Image" });
        expect(clip.width).toBeLessThan(500);
        await expectPageClip(page, clip, join(here, "screenshots", "images.png"));
    });

    it("keeps settled images in place while the caret moves", async () => {
        const result = await page.evaluate(async () => {
            const api = (window as unknown as {
                __inlineMarkdown: { getDocument(): string; setCursor(offset: number): void };
            }).__inlineMarkdown;
            const doc = api.getDocument();
            const picture = document.querySelector("img.inline-md-image");
            if (!(picture instanceof HTMLImageElement)) {
                return { foreign: ["missing picture"], labels: [] as string[], settled: false };
            }
            picture.dataset.settled = "blue";
            const foreign: string[] = [];
            const observer = new MutationObserver((records) => {
                const note = (image: HTMLImageElement): void => {
                    const src = image.getAttribute("src") ?? "";
                    if (image.dataset.settled === "blue") {
                        return;
                    }
                    foreign.push(src.length > 0 ? src : image.alt);
                };
                for (const record of records) {
                    for (const node of record.addedNodes) {
                        if (node instanceof HTMLImageElement) {
                            note(node);
                        }
                        if (node instanceof Element) {
                            for (const image of node.querySelectorAll("img")) {
                                note(image);
                            }
                        }
                    }
                }
            });
            observer.observe(document.body, { childList: true, subtree: true });
            const spots = [
                doc.indexOf("Missing chart"),
                doc.indexOf("also-missing"),
                0,
                doc.length,
            ];
            for (const offset of spots) {
                api.setCursor(Math.max(0, offset));
                await new Promise((resolve) => {
                    requestAnimationFrame(() => requestAnimationFrame(resolve));
                });
            }
            observer.disconnect();
            const still = document.querySelector("img.inline-md-image");
            const labels = [...document.querySelectorAll(".inline-md-image-fallback")].map((node) => node.textContent ?? "");
            return {
                foreign,
                labels,
                settled: still instanceof HTMLImageElement && still.dataset.settled === "blue",
            };
        });
        expect(result.foreign).toEqual([]);
        expect(result.settled).toBe(true);
        expect(result.labels).toEqual(expect.arrayContaining(["Missing chart", "Image"]));
    });
});
