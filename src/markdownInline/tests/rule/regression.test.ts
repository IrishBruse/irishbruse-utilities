import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { expectLineRangeShot, openPlayground } from "../../support/browser";
import type { Browser, Page } from "playwright-core";

const here = dirname(fileURLToPath(import.meta.url));
const fixture = "rule/fixtures/case-1.md";

async function arrowOntoRule(page: Page, direction: "down" | "up"): Promise<{ onRule: boolean; shown: boolean; offset: number; rule: number }> {
    await page.evaluate((dir) => {
        const api = (window as unknown as {
            __inlineMarkdown: {
                focus(): void;
                getDocument(): string;
                setCursor(offset: number): void;
            };
        }).__inlineMarkdown;
        const source = api.getDocument();
        const rule = source.indexOf("---");
        api.focus();
        api.setCursor(dir === "down" ? rule - 1 : rule + 4);
    }, direction);
    await page.keyboard.press(direction === "down" ? "ArrowDown" : "ArrowUp");
    await page.evaluate(() => new Promise((resolve) => {
        requestAnimationFrame(() => requestAnimationFrame(resolve));
    }));
    return page.evaluate(() => {
        const api = (window as unknown as {
            __inlineMarkdown: { getCursor(): number; getDocument(): string };
        }).__inlineMarkdown;
        const source = api.getDocument();
        const offset = api.getCursor();
        const rule = source.indexOf("---");
        const fold = (value: string | null) => (value ?? "").replaceAll("\u00a0", " ");
        const shown = [...document.querySelectorAll("#editor .view-line")].some((line) => fold(line.textContent).includes("---"));
        return {
            onRule: offset >= rule && offset < rule + 3,
            shown,
            offset,
            rule,
        };
    });
}

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
        const clip = await expectLineRangeShot(page, join(here, "screenshots", "rule.png"), {
            from: "Before the rule",
            to: "After the rule",
            fullWidth: [".inline-md-hr", ".inline-md-hr-line"],
        });
        expect(clip.height).toBeLessThan(160);
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

    it("stops on the dashes when the down arrow moves off the blank line above the rule", async () => {
        const landed = await arrowOntoRule(page, "down");
        expect(landed.onRule).toBe(true);
        expect(landed.shown).toBe(true);
    });

    it("stops on the dashes when the up arrow moves off the blank line below the rule", async () => {
        const landed = await arrowOntoRule(page, "up");
        expect(landed.onRule).toBe(true);
        expect(landed.shown).toBe(true);
    });

    it("shows the dashes when the rule line is clicked", async () => {
        await page.evaluate(() => {
            const api = (window as unknown as {
                __inlineMarkdown: { setCursor(offset: number): void };
            }).__inlineMarkdown;
            api.setCursor(0);
        });
        await page.waitForFunction(() => document.querySelector(".inline-md-hr-line") instanceof HTMLElement);
        await page.locator(".inline-md-hr-line").click();
        const shown = await page.waitForFunction(
            () => (document.querySelector("#editor .view-lines")?.textContent ?? "").replaceAll("\u00a0", " ").includes("---"),
            null,
            { timeout: 2000 },
        ).then(() => true).catch(() => false);
        const landed = await page.evaluate(() => {
            const api = (window as unknown as {
                __inlineMarkdown: { getCursor(): number; getDocument(): string };
            }).__inlineMarkdown;
            const source = api.getDocument();
            const rule = source.indexOf("---");
            return { offset: api.getCursor(), end: rule + "---".length };
        });
        expect(shown).toBe(true);
        expect(landed.offset).toBe(landed.end);
    });
});
