import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, describe, expect, it } from "vite-plus/test";
import { bulletLines, expectLineRangeShot, openPlayground } from "../../../../test/support/browser";
import type { Browser, Page } from "playwright-core";

const here = dirname(fileURLToPath(import.meta.url));
const fixtureCase1 = "markdown/list/bullet/test/fixtures/case-1.md";
const fixtureCase3 = "markdown/list/bullet/test/fixtures/case-3.md";

describe("nested list bullets stay visible", () => {
    let browser: Browser;
    let page: Page;

    beforeAll(async () => {
        const opened = await openPlayground(fixtureCase1);
        browser = opened.browser;
        page = opened.page;
    });

    afterAll(async () => {
        await browser?.close();
    });

    it("paints the nested bullet where the pointer lands", async () => {
        const [nested] = await bulletLines(page, ["Nested bullet"]);
        expect(nested?.hitIsBullet).toBe(true);
        expect(nested?.bulletRight).toBeGreaterThan(0);
    });

    it("matches the saved picture of the list", async () => {
        await expectLineRangeShot(page, join(here, "screenshots", "list.png"), {
            from: "Heading for color",
            to: "Nested ordered",
        });
    });
});

describe("list bullet column", () => {
    let browser: Browser;
    let page: Page;

    beforeAll(async () => {
        const opened = await openPlayground(fixtureCase3, "keeps reveal");
        browser = opened.browser;
        page = opened.page;
    });

    afterAll(async () => {
        await browser?.close();
    });

    it("paints the bullet on the raw dash, outside the gutter", async () => {
        const placed = await page.evaluate(() => {
            const fold = (value: string | null) => (value ?? "").replaceAll("\u00a0", " ");
            const line = [...document.querySelectorAll("#editor .view-line")].find((entry) =>
                fold(entry.textContent).includes("keeps reveal"),
            );
            if (!(line instanceof HTMLElement)) {
                return null;
            }
            const lineBox = line.getBoundingClientRect();
            const bullet = [...line.querySelectorAll(".inline-md-list-mark")].find(
                (entry) => entry.childElementCount === 0,
            );
            const number = [...document.querySelectorAll("#editor .line-numbers")].find((entry) => {
                return Math.abs(entry.getBoundingClientRect().top - lineBox.top) <= 2;
            });
            if (!(bullet instanceof HTMLElement) || !(number instanceof HTMLElement)) {
                return null;
            }
            const bulletBox = bullet.getBoundingClientRect();
            return {
                bulletLeft: bulletBox.left,
                lineLeft: lineBox.left,
                numberRight: number.getBoundingClientRect().right,
            };
        });
        expect(placed).not.toBeNull();
        expect(placed!.bulletLeft).toBeGreaterThan(placed!.numberRight - 1);
        expect(Math.abs(placed!.bulletLeft - placed!.lineLeft)).toBeLessThanOrEqual(1);
    });

    it("shows a bullet before the label", async () => {
        const seen = await page.evaluate(() => {
            const fold = (value: string | null) => (value ?? "").replaceAll("\u00a0", " ");
            const line = [...document.querySelectorAll("#editor .view-line")].find((entry) =>
                fold(entry.textContent).includes("keeps reveal"),
            );
            if (!(line instanceof HTMLElement)) {
                return null;
            }
            const label = [...line.querySelectorAll("span")].find((span) =>
                fold(span.textContent).startsWith("Change"),
            );
            const bullet = [...line.querySelectorAll(".inline-md-list-mark")].find(
                (span) => span.childElementCount === 0,
            );
            const number = [...document.querySelectorAll("#editor .line-numbers")].find((entry) => {
                return (
                    Math.abs(
                        entry.getBoundingClientRect().top - line.getBoundingClientRect().top,
                    ) <= 2
                );
            });
            if (
                !(label instanceof HTMLElement) ||
                !(bullet instanceof HTMLElement) ||
                !(number instanceof HTMLElement)
            ) {
                return null;
            }
            const bulletBox = bullet.getBoundingClientRect();
            return {
                bulletLeft: bulletBox.left,
                bulletRight: bulletBox.right,
                bulletText: bullet.textContent,
                labelLeft: label.getBoundingClientRect().left,
                numberRight: number.getBoundingClientRect().right,
            };
        });
        expect(seen).not.toBeNull();
        expect(seen!.bulletText).toBe("•");
        expect(seen!.bulletLeft).toBeGreaterThan(seen!.numberRight - 1);
        expect(seen!.labelLeft).toBeGreaterThan(seen!.bulletRight + 1);
    });

    it("matches the saved picture of the bullet on the dash column", async () => {
        await expectLineRangeShot(page, join(here, "screenshots", "bullet-on-dash.png"), {
            from: "keeps reveal",
            to: "modules",
        });
    });
});
