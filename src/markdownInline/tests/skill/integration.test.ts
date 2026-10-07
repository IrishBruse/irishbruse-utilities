import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { openPlayground } from "../support/browser";
import type { Browser, Page } from "playwright-core";

describe("skill front matter", () => {
    let browser: Browser;
    let page: Page;

    beforeAll(async () => {
        const opened = await openPlayground("skill/fixtures/markdown-skill-fixture/SKILL.md");
        browser = opened.browser;
        page = opened.page;
    });

    afterAll(async () => {
        await browser?.close();
    });

    it("keeps the YAML front matter in the editor", async () => {
        const text = (await page.locator("#editor .view-lines").innerText()).replaceAll("\u00a0", " ");
        expect(text).toContain("name: markdown-skill-fixture");
        expect(text).toContain("description:");
        expect(text).toContain("disable-model-invocation: true");
        expect(text).toContain("license: MIT");
    });

    it("colors keys, strings, and booleans as YAML", async () => {
        const colors = await page.waitForFunction(() => {
            const fold = (value: string | null) => (value ?? "").replaceAll("\u00a0", " ");
            const colorOf = (needle: string): string => {
                const spans = [...document.querySelectorAll("#editor .view-line span")];
                const span = spans.find((entry) => fold(entry.textContent) === needle);
                return span ? getComputedStyle(span).color : "";
            };
            const key = colorOf("name");
            const value = colorOf("markdown-skill-fixture");
            const flag = colorOf("true");
            if (!key || !value || !flag || key === value || key === flag) {
                return null;
            }
            return { key, value, flag };
        });
        expect(await colors.jsonValue()).toMatchObject({
            key: expect.any(String),
            value: expect.any(String),
            flag: expect.any(String),
        });
    });

    it("offers remaining skill properties when a new key is typed", async () => {
        await page.evaluate(() => {
            const api = (window as unknown as {
                __inlineMarkdown: {
                    focus(): void;
                    getDocument(): string;
                    setCursor(offset: number): void;
                };
            }).__inlineMarkdown;
            const source = api.getDocument();
            const at = source.indexOf("license: MIT");
            api.focus();
            api.setCursor(at + "license: MIT".length);
        });
        await page.keyboard.press("Enter");
        await page.keyboard.type("c");
        const labels = page.locator(".suggest-widget .monaco-list-row .label-name");
        await labels.first().waitFor({ state: "visible" });
        const names = await labels.allInnerTexts();
        expect(names).toContain("compatibility");
        expect(names).toContain("color");
    });
});
