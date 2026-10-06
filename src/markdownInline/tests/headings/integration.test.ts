import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { expectLineRangeShot, openPlayground } from "../../support/browser";
import type { Browser, Page } from "playwright-core";

const here = dirname(fileURLToPath(import.meta.url));
const fixture = "headings/fixtures/case-1.md";

interface LineBox {
    readonly height: number;
    readonly step: number;
}

async function lineBox(page: Page, needle: string): Promise<LineBox | null> {
    return page.evaluate((title) => {
        const fold = (value: string | null) => (value ?? "").replaceAll("\u00a0", " ");
        const lines = [...document.querySelectorAll<HTMLElement>("#editor .view-line")];
        const index = lines.findIndex((line) => fold(line.textContent).includes(title));
        const line = lines[index];
        const above = lines[index - 1];
        if (!(line instanceof HTMLElement) || !(above instanceof HTMLElement)) {
            return null;
        }
        const box = line.getBoundingClientRect();
        const aboveBox = above.getBoundingClientRect();
        return {
            height: box.height,
            step: box.top - aboveBox.top,
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

    it("uses the same line height as a paragraph line", async () => {
        const heading = await lineBox(page, "Description");
        const body = await lineBox(page, "Better syntax highlight");
        expect(heading).not.toBeNull();
        expect(body).not.toBeNull();
        expect(heading!.height).toBe(body!.height);
        expect(heading!.step).toBe(body!.step);
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
