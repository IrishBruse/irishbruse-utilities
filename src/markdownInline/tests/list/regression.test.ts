import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { bulletLines, expectEditorShot, openPlayground } from "../../support/browser";
import type { Browser, Page } from "playwright-core";

const here = dirname(fileURLToPath(import.meta.url));

describe("nested list bullets stay visible", () => {
    let browser: Browser;
    let page: Page;

    beforeAll(async () => {
        const opened = await openPlayground("list/test-1.md");
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
        await expectEditorShot(page, join(here, "screenshots", "list.png"));
    });
});
