import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { expectLineRangeShot, openPlayground } from "../../support/browser";
import type { Browser, Page } from "playwright-core";

const here = dirname(fileURLToPath(import.meta.url));

describe("skill front matter looks like a code block", () => {
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

    it("paints the darker code-block background and a yaml label in the top right", async () => {
        const block = await page.evaluate(() => {
            const fold = (value: string | null) => (value ?? "").replaceAll("\u00a0", " ");
            const root = document.querySelector(".inline-md-root");
            const editor = document.querySelector("#editor");
            const lines = [...document.querySelectorAll("#editor .view-line")];
            const nameLine = lines.find((line) => fold(line.textContent).includes("name:"));
            const opener = lines[0];
            if (!(root instanceof HTMLElement) || !(editor instanceof HTMLElement) || !nameLine || !opener) {
                return { backgroundMatchesCode: false, lang: "", langAtTopRight: false };
            }
            const probe = document.createElement("span");
            probe.style.backgroundColor = getComputedStyle(root).getPropertyValue("--ib-md-code-block-background").trim();
            document.body.append(probe);
            const codeBackground = getComputedStyle(probe).backgroundColor;
            probe.remove();
            const nameBox = nameLine.getBoundingClientRect();
            const painted = [...document.querySelectorAll("#editor .inline-md-code-line")].some((entry) => {
                const box = entry.getBoundingClientRect();
                return box.top <= nameBox.top + 2
                    && box.bottom >= nameBox.bottom - 2
                    && getComputedStyle(entry).backgroundColor === codeBackground;
            });
            const label = [...document.querySelectorAll("#editor .inline-md-lang")].find((entry) => fold(entry.textContent).trim() === "yaml");
            const labelBox = label?.getBoundingClientRect();
            const openerBox = opener.getBoundingClientRect();
            const gap = labelBox ? openerBox.right - labelBox.right : -1;
            const langAtTopRight = !!labelBox
                && labelBox.width > 0
                && labelBox.height > 0
                && Math.abs(labelBox.top - openerBox.top) <= 4
                && gap >= 8
                && gap <= 24
                && labelBox.left > openerBox.left + openerBox.width / 2;
            return {
                backgroundMatchesCode: painted,
                lang: label ? fold(label.textContent).trim() : "",
                langAtTopRight,
            };
        });
        expect(block.backgroundMatchesCode).toBe(true);
        expect(block.lang).toBe("yaml");
        expect(block.langAtTopRight).toBe(true);
    });

    it("matches the saved picture of the front matter", async () => {
        const clip = await expectLineRangeShot(page, join(here, "screenshots", "skill.png"), {
            from: "---",
            to: "---",
            fullWidth: [".inline-md-code-line"],
        });
        expect(clip.height).toBeLessThan(220);
    });
});
