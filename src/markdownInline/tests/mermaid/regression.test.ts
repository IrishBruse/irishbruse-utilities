import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { expectLocatorShot, openPlayground } from "../support/browser";
import type { Browser, Page } from "playwright-core";

const here = dirname(fileURLToPath(import.meta.url));

const fixture = "mermaid/fixtures/case-1.md";

describe("mermaid open preview", () => {
    let browser: Browser;
    let page: Page;

    beforeAll(async () => {
        const opened = await openPlayground(fixture, "Before the fence.");
        browser = opened.browser;
        page = opened.page;
        await page.evaluate(() => {
            const api = (window as unknown as {
                __inlineMarkdown: { getDocument(): string; setCursor(offset: number): void };
            }).__inlineMarkdown;
            api.setCursor(api.getDocument().indexOf("Before"));
        });
        await page.waitForFunction(() => {
            const frame = document.querySelector(".inline-md-mermaid");
            const button = frame?.querySelector(".inline-md-mermaid-open-preview");
            const svg = frame?.querySelector(".inline-md-mermaid-diagram svg");
            if (!(frame instanceof HTMLElement) || !(button instanceof HTMLElement) || !(svg instanceof SVGElement)) {
                return false;
            }
            const frameBox = frame.getBoundingClientRect();
            const buttonBox = button.getBoundingClientRect();
            const svgBox = svg.getBoundingClientRect();
            return buttonBox.height > 0
                && svgBox.height > 20
                && buttonBox.bottom <= svgBox.top + 1
                && svgBox.bottom <= frameBox.bottom + 1;
        });
    }, 45_000);

    afterAll(async () => {
        await browser?.close();
    });

    it("places Open Preview above the diagram", async () => {
        const boxes = await page.evaluate(() => {
            const frame = document.querySelector(".inline-md-mermaid");
            const button = frame?.querySelector(".inline-md-mermaid-open-preview");
            const svg = frame?.querySelector(".inline-md-mermaid-diagram svg");
            if (!(frame instanceof HTMLElement) || !(button instanceof HTMLElement) || !(svg instanceof SVGElement)) {
                return null;
            }
            const frameBox = frame.getBoundingClientRect();
            const buttonBox = button.getBoundingClientRect();
            const svgBox = svg.getBoundingClientRect();
            const lensOverlap = [...document.querySelectorAll(".codelens-decoration")].some((node) => {
                if (!(node instanceof HTMLElement) || !node.textContent?.includes("Open Preview")) {
                    return false;
                }
                const lens = node.getBoundingClientRect();
                return lens.width > 0 && lens.height > 0 && lens.bottom > svgBox.top && lens.top < svgBox.bottom;
            });
            return {
                buttonBottom: buttonBox.bottom,
                svgTop: svgBox.top,
                svgBottom: svgBox.bottom,
                frameBottom: frameBox.bottom,
                lensOverlap,
            };
        });
        expect(boxes).not.toBeNull();
        expect(boxes!.buttonBottom).toBeLessThanOrEqual(boxes!.svgTop + 1);
        expect(boxes!.svgBottom).toBeLessThanOrEqual(boxes!.frameBottom + 1);
        expect(boxes!.lensOverlap).toBe(false);
    });

    it("shows Open Preview above the diagram", async () => {
        await expectLocatorShot(page.locator(".inline-md-mermaid"), join(here, "screenshots", "mermaid.png"));
    });
});
