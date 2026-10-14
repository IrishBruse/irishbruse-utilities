import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, describe, expect, it } from "vite-plus/test";
import { openPlayground } from "../support/browser";
import type { Browser, Page } from "playwright-core";

const sample = readFileSync(
    join(dirname(fileURLToPath(import.meta.url)), "fixtures", "case-1.md"),
    "utf8",
);

describe("clipboard commands", () => {
    let browser: Browser;
    let page: Page;

    beforeAll(async () => {
        const opened = await openPlayground("test/clipboard/fixtures/case-1.md", "clipboard");
        browser = opened.browser;
        page = opened.page;
        await page.context().grantPermissions(["clipboard-read", "clipboard-write"]);
        await page.evaluate((text) => {
            window.__inlineMarkdown.setDocument(text);
        }, sample);
    });

    afterAll(async () => {
        await browser?.close();
    });

    it("copies, cuts, and pastes through the host clipboard commands", async () => {
        const result = await page.evaluate(async () => {
            const api = window.__inlineMarkdown;
            const doc = api.getDocument();
            const word = "clipboard";
            const start = doc.indexOf(word);
            api.select(start, start + word.length);
            api.focus();
            const copied = document.execCommand("copy");
            const copyText = await navigator.clipboard.readText();
            const cut = document.execCommand("cut");
            await new Promise((resolve) => {
                setTimeout(resolve, 50);
            });
            const afterCut = api.getDocument();
            const cutText = await navigator.clipboard.readText();
            api.setCursor(afterCut.length);
            api.focus();
            await navigator.clipboard.writeText("pasted");
            const pasted = document.execCommand("paste");
            await new Promise((resolve) => {
                setTimeout(resolve, 50);
            });
            return {
                copied,
                copyText,
                cut,
                afterCut,
                cutText,
                pasted,
                afterPaste: api.getDocument(),
            };
        });
        expect(result.copyText).toBe("clipboard");
        expect(result.afterCut).toBe("Alpha  word.\n\nBeta line.\n");
        expect(result.cutText).toBe("clipboard");
        expect(result.pasted).toBe(true);
        expect(result.afterPaste).toBe("Alpha  word.\n\nBeta line.\npasted");
    });

    it("copies through a Cmd+C keydown", async () => {
        const result = await page.evaluate(async () => {
            const api = window.__inlineMarkdown;
            const doc = "Alpha clipboard word.\n";
            api.setDocument(doc);
            const start = doc.indexOf("clipboard");
            api.select(start, start + "clipboard".length);
            api.focus();
            await navigator.clipboard.writeText("before");
            const event = new KeyboardEvent("keydown", {
                key: "c",
                code: "KeyC",
                metaKey: true,
                bubbles: true,
                cancelable: true,
            });
            window.dispatchEvent(event);
            await new Promise((resolve) => {
                setTimeout(resolve, 50);
            });
            return {
                prevented: event.defaultPrevented,
                text: await navigator.clipboard.readText(),
            };
        });
        expect(result.prevented).toBe(true);
        expect(result.text).toBe("clipboard");
    });
});
