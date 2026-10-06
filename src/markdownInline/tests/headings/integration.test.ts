import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { headingViewLineHeightPx } from "../../src/preview/headingGap";
import { expectLineRangeShot, openPlayground } from "../../support/browser";
import type { Browser, Page } from "playwright-core";

const here = dirname(fileURLToPath(import.meta.url));
const fixture = "headings/fixtures/case-1.md";

interface LineBox {
    readonly height: number;
    readonly stepBelow: number;
}

async function lineBox(page: Page, needle: string): Promise<LineBox | null> {
    return page.evaluate((title) => {
        const fold = (value: string | null) => (value ?? "").replaceAll("\u00a0", " ");
        const lines = [...document.querySelectorAll<HTMLElement>("#editor .view-line")];
        const index = lines.findIndex((line) => fold(line.textContent).includes(title));
        const line = lines[index];
        const below = lines[index + 1];
        if (!(line instanceof HTMLElement) || !(below instanceof HTMLElement)) {
            return null;
        }
        const box = line.getBoundingClientRect();
        const belowBox = below.getBoundingClientRect();
        return {
            height: box.height,
            stepBelow: belowBox.top - box.top,
        };
    }, needle);
}

describe("heading line height", () => {
    let browser: Browser;
    let page: Page;

    beforeAll(async () => {
        const opened = await openPlayground(fixture, "Description");
        browser = opened.browser;
        page = opened.page;
        await page.waitForFunction(() => document.querySelector(".inline-md-h2") instanceof HTMLElement);
    });

    afterAll(async () => {
        await browser?.close();
    });

    it("sizes scaled heading lines from HEADING_SCALE", async () => {
        const h1 = await lineBox(page, "Main title");
        const heading = await lineBox(page, "Description");
        const body = await lineBox(page, "Better syntax highlight");
        expect(h1).not.toBeNull();
        expect(heading).not.toBeNull();
        expect(body).not.toBeNull();
        const bodyHeight = body!.height;
        expect(h1!.height).toBe(headingViewLineHeightPx(bodyHeight, 1));
        expect(heading!.height).toBe(headingViewLineHeightPx(bodyHeight, 2));
    });

    it("places the next line below the full heading row", async () => {
        const h1 = await lineBox(page, "Main title");
        expect(h1).not.toBeNull();
        expect(h1!.stepBelow).toBe(h1!.height);
    });

    it("matches the saved picture around the section heading", async () => {
        const clip = await expectLineRangeShot(page, join(here, "screenshots", "heading-gap.png"), {
            from: "Intro line",
            to: "Body under section",
            lineNumbers: true,
        });
        expect(clip.height).toBeLessThan(320);
    });
});
