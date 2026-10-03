import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { expectPageClip, featureClip, openPlayground } from "../../support/browser";
import type { Browser, Page } from "playwright-core";

const here = dirname(fileURLToPath(import.meta.url));
const fixture = "rule/fixtures/case-1.md";

describe("horizontal rule spacing", () => {
    let browser: Browser;
    let page: Page;

    beforeAll(async () => {
        const opened = await openPlayground(fixture, "Before the rule");
        browser = opened.browser;
        page = opened.page;
        await page.evaluate(() => {
            const api = (window as unknown as {
                __inlineMarkdown: { setCursor(offset: number): void };
            }).__inlineMarkdown;
            api.setCursor(0);
        });
        await page.waitForFunction(() => document.querySelector(".inline-md-hr") instanceof HTMLElement);
    });

    afterAll(async () => {
        await browser?.close();
    });

    it("keeps blank lines on either side of the rule visible", async () => {
        const lines = await page.evaluate(() => {
            const fold = (value: string | null) => (value ?? "").replaceAll("\u00a0", " ");
            return [...document.querySelectorAll("#editor .view-line")].map((line) => fold(line.textContent));
        });
        const before = lines.indexOf("Before the rule.");
        const after = lines.indexOf("After the rule.");
        expect(before).toBeGreaterThanOrEqual(0);
        expect(after).toBe(before + 3);
        expect(lines[before + 1]).toBe("");
        expect(lines[before + 2]).toBe("");
    });

    it("keeps the rule one normal line tall", async () => {
        const gap = await page.evaluate(() => {
            const fold = (value: string | null) => (value ?? "").replaceAll("\u00a0", " ");
            const lines = [...document.querySelectorAll("#editor .view-line")];
            const before = lines.find((line) => fold(line.textContent).includes("Before the rule"));
            const after = lines.find((line) => fold(line.textContent).includes("After the rule"));
            const rule = document.querySelector(".inline-md-hr");
            const zone = rule?.closest(".view-zones > *");
            if (!(before instanceof HTMLElement) || !(after instanceof HTMLElement) || !(zone instanceof HTMLElement)) {
                return null;
            }
            const above = before.getBoundingClientRect();
            const below = after.getBoundingClientRect();
            const band = zone.getBoundingClientRect();
            return {
                line: above.height,
                rule: band.height,
                between: below.top - above.bottom,
            };
        });
        expect(gap).not.toBeNull();
        expect(gap?.rule).toBeLessThanOrEqual((gap?.line ?? 0) + 1);
    });

    it("matches the saved picture of the rule", async () => {
        const clip = await featureClip(page, { from: "Before the rule", to: "After the rule", fullWidth: [".inline-md-hr", ".inline-md-hr-line"] });
        expect(clip.height).toBeLessThan(160);
        await expectPageClip(page, clip, join(here, "screenshots", "rule.png"));
    });
});

describe("horizontal rule editing", () => {
    let browser: Browser;
    let page: Page;

    beforeAll(async () => {
        const opened = await openPlayground(fixture, "Before the rule");
        browser = opened.browser;
        page = opened.page;
        await page.evaluate(() => {
            const api = (window as unknown as {
                __inlineMarkdown: { setCursor(offset: number): void };
            }).__inlineMarkdown;
            api.setCursor(0);
        });
        await page.waitForFunction(() => document.querySelector(".inline-md-hr-line") instanceof HTMLElement);
    });

    afterAll(async () => {
        await browser?.close();
    });

    it("shows the dashes when the rule line is clicked", async () => {
        await page.locator(".inline-md-hr-line").click();
        const shown = await page.waitForFunction(
            () => (document.querySelector("#editor .view-lines")?.textContent ?? "").replaceAll("\u00a0", " ").includes("---"),
            null,
            { timeout: 2000 },
        ).then(() => true).catch(() => false);
        expect(shown).toBe(true);
    });
});
