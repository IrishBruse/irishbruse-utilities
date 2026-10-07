import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { expectLineRangeShot, openPlayground } from "../support/browser";
import type { Browser, Page } from "playwright-core";

const here = dirname(fileURLToPath(import.meta.url));
const fixture = "fence/fixtures/case-1.md";

describe("fenced code colors", () => {
    let browser: Browser;
    let page: Page;

    beforeAll(async () => {
        const opened = await openPlayground(fixture, "Before the fence.");
        browser = opened.browser;
        page = opened.page;
        await page.evaluate(() => {
            const api = (window as unknown as {
                __inlineMarkdown: { focus(): void; getDocument(): string; setCursor(offset: number): void };
            }).__inlineMarkdown;
            const source = api.getDocument();
            api.focus();
            api.setCursor(source.indexOf("flowchart"));
        });
        await page.waitForFunction(() => {
            const fold = (value: string | null) => (value ?? "").replaceAll("\u00a0", " ");
            return [...document.querySelectorAll("#editor .view-line")].some((line) => fold(line.textContent).includes("```mermaid"));
        });
    }, 45_000);

    afterAll(async () => {
        await browser?.close();
    });

    it("paints the backticks in the editor text color and the language name in cyan", async () => {
        const colors = await page.evaluate(() => {
            const fold = (value: string | null) => (value ?? "").replaceAll("\u00a0", " ");
            const line = [...document.querySelectorAll("#editor .view-line")].find((entry) => fold(entry.textContent).includes("```mermaid"));
            const spans = [...(line?.querySelectorAll("span") ?? [])]
                .filter((span) => span.childElementCount === 0)
                .map((span) => ({ text: fold(span.textContent), color: getComputedStyle(span).color }));
            return spans;
        });
        expect(colors.filter((span) => span.text.includes("`") || span.text.includes("mermaid"))).toEqual([
            { text: "```", color: "rgb(171, 178, 191)" },
            { text: "mermaid", color: "rgb(86, 182, 194)" },
        ]);
        const closing = await page.evaluate(() => {
            const fold = (value: string | null) => (value ?? "").replaceAll("\u00a0", " ");
            const line = [...document.querySelectorAll("#editor .view-line")].find((entry) => fold(entry.textContent).trim() === "```");
            const span = [...(line?.querySelectorAll("span") ?? [])].find((entry) => entry.childElementCount === 0 && fold(entry.textContent) === "```");
            return span ? getComputedStyle(span).color : "";
        });
        expect(closing).toBe("rgb(171, 178, 191)");
    });

    it("shows the opening and closing fences", async () => {
        await expectLineRangeShot(page, join(here, "screenshots/fence.png"), { from: "```mermaid", to: "```" });
    });
});

describe("ordered marker inside a markdown fence", () => {
    let browser: Browser;
    let page: Page;

    beforeAll(async () => {
        const opened = await openPlayground("fence/fixtures/case-2.md", "Only steps");
        browser = opened.browser;
        page = opened.page;
    }, 45_000);

    afterAll(async () => {
        await browser?.close();
    });

    it("renders 1. as literal text with the same spacing as the next line", async () => {
        const reading = await page.evaluate(() => {
            const fold = (value: string | null) => (value ?? "").replaceAll("\u00a0", " ");
            const lines = [...document.querySelectorAll("#editor .view-line")];
            const marker = lines.find((entry) => fold(entry.textContent).includes("1. Only steps"));
            const plain = lines.find((entry) => fold(entry.textContent).trim() === "plain line");
            const afterPlain = plain ? lines[lines.indexOf(plain) + 1] : undefined;
            if (!(marker instanceof HTMLElement) || !(plain instanceof HTMLElement) || !(afterPlain instanceof HTMLElement)) {
                return null;
            }
            const markerBox = marker.getBoundingClientRect();
            const plainBox = plain.getBoundingClientRect();
            const afterBox = afterPlain.getBoundingClientRect();
            const leaves = (line: Element) => [...line.querySelectorAll("span")].filter((span) => span.childElementCount === 0 && fold(span.textContent).trim().length > 0);
            const markerLeaves = leaves(marker).map((span) => ({ text: fold(span.textContent), color: getComputedStyle(span).color }));
            const plainLeaves = leaves(plain).map((span) => ({ text: fold(span.textContent), color: getComputedStyle(span).color }));
            const markerSpan = markerLeaves.find((span) => span.text.includes("1."));
            const plainSpan = plainLeaves.find((span) => span.text.includes("plain"));
            return {
                markerText: markerSpan?.text ?? "",
                plainText: plainSpan?.text ?? "",
                markerColor: markerSpan?.color ?? "",
                plainColor: plainSpan?.color ?? "",
                listGap: marker.classList.contains("inline-md-list-gap-after"),
                markerStep: lines[lines.indexOf(marker) + 1]!.getBoundingClientRect().top - markerBox.top,
                plainStep: afterBox.top - plainBox.top,
            };
        });
        expect(reading?.markerText).toContain("1. Only steps");
        expect(reading?.plainText).toBe("plain line");
        expect(reading?.markerColor).toBe(reading?.plainColor);
        expect(reading?.plainColor).not.toBe("");
        expect(reading?.listGap).toBe(false);
        expect(reading?.markerStep).toBe(reading?.plainStep);
    });

    it("shows the ordered marker as literal text", async () => {
        await expectLineRangeShot(page, join(here, "screenshots/markdown-fence-ordered.png"), {
            from: "1. Only steps",
            to: "plain line",
        });
    });
});
