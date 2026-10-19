import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, describe, expect, it } from "vite-plus/test";
import { expectLineRangeShot, openPlayground } from "../support/browser";
import type { Browser, Page } from "playwright-core";

const here = dirname(fileURLToPath(import.meta.url));
const fixture = "test/whitespace/fixtures/case-1.md";

describe("trailing whitespace", () => {
    let browser: Browser;
    let page: Page;

    beforeAll(async () => {
        const opened = await openPlayground(fixture, "Trailing spaces end this line.");
        browser = opened.browser;
        page = opened.page;
    }, 45_000);

    afterAll(async () => {
        await browser?.close();
    });

    it("paints a gray circle for each trailing space", async () => {
        const reading = await page.evaluate(() => {
            const fold = (value: string | null) => (value ?? "").replaceAll("\u00a0", " ");
            const lines = [...document.querySelectorAll("#editor .view-line")];
            const trailing = lines.find((entry) =>
                fold(entry.textContent).includes("Trailing spaces end this line."),
            );
            const mid = lines.find((entry) => fold(entry.textContent).includes("mid space"));
            if (!(trailing instanceof HTMLElement) || !(mid instanceof HTMLElement)) {
                return null;
            }
            const overlays = [...document.querySelectorAll("#editor .view-overlays > div")];
            const overlayFor = (line: HTMLElement) => {
                const top = line.getBoundingClientRect().top;
                return overlays.find(
                    (entry) => Math.abs(entry.getBoundingClientRect().top - top) <= 2,
                );
            };
            const trailingOverlay = overlayFor(trailing);
            const midOverlay = overlayFor(mid);
            const circles = (overlay: Element | undefined) => {
                const path = overlay?.querySelector("svg path");
                const d = path?.getAttribute("d") ?? "";
                return (d.match(/ a /g) ?? []).length / 2;
            };
            const fill = trailingOverlay?.querySelector("svg")?.getAttribute("fill") ?? "";
            return {
                trailingCircles: circles(trailingOverlay),
                midCircles: circles(midOverlay),
                fill,
            };
        });
        expect(reading).not.toBeNull();
        expect(reading!.trailingCircles).toBe(3);
        expect(reading!.midCircles).toBe(0);
        expect(reading!.fill.toLowerCase()).not.toBe("");
        expect(reading!.fill.toLowerCase()).not.toBe("#000000");
    });

    it("shows the trailing space circles", async () => {
        await expectLineRangeShot(page, join(here, "screenshots", "trailing-spaces.png"), {
            from: "Trailing spaces end this line.",
            to: "mid space stays plain.",
        });
    });
});
