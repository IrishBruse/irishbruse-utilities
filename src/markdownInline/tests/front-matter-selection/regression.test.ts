import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { expectLineRangeShot, openPlayground } from "../support/browser";
import type { Browser, Page } from "playwright-core";

const here = dirname(fileURLToPath(import.meta.url));
const fixture = "front-matter-selection/fixtures/case-1.md";

interface SpanBox {
    readonly left: number;
    readonly right: number;
}

interface LineReading {
    readonly text: string;
    readonly pieces: ReadonlyArray<SpanBox>;
    readonly dashes: SpanBox | null;
    readonly name: SpanBox | null;
    readonly labelOnRight: boolean;
}

async function readSelection(page: Page): Promise<LineReading> {
    return page.evaluate(async () => {
        const api = window.__inlineMarkdown;
        const doc = api.getDocument();
        const end = doc.indexOf("\n", doc.indexOf("disable-model-invocation:"));
        api.select(0, end);
        await new Promise((resolve) => {
            requestAnimationFrame(() => requestAnimationFrame(resolve));
        });
        const fold = (value: string | null) => (value ?? "").replaceAll("\u00a0", " ");
        const lines = [...document.querySelectorAll("#editor .view-line")];
        const opener = lines[0];
        const nameLine = lines.find((line) => fold(line.textContent).includes("name:"));
        if (!(opener instanceof HTMLElement) || !(nameLine instanceof HTMLElement)) {
            return { text: "", pieces: [], dashes: null, name: null, labelOnRight: false };
        }
        const openerBox = opener.getBoundingClientRect();
        const relative = (box: DOMRect): SpanBox => ({
            left: box.left - openerBox.left,
            right: box.right - openerBox.left,
        });
        const leaf = (line: Element, needle: string): SpanBox | null => {
            const span = [...line.querySelectorAll("span")].find((entry) => entry.childElementCount === 0 && fold(entry.textContent) === needle);
            return span ? relative(span.getBoundingClientRect()) : null;
        };
        const pieces = [...document.querySelectorAll<HTMLElement>(".selected-text")]
            .map((piece) => piece.getBoundingClientRect())
            .filter((box) => box.bottom > openerBox.top + 0.5 && box.top < openerBox.bottom - 0.5 && box.width > 0.5)
            .map(relative);
        const label = [...document.querySelectorAll("#editor .inline-md-lang")].find((entry) => fold(entry.textContent).trim() === "yaml");
        const labelBox = label?.getBoundingClientRect();
        return {
            text: fold(opener.textContent),
            pieces,
            dashes: leaf(opener, "---"),
            name: leaf(nameLine, "name"),
            labelOnRight: !!labelBox && labelBox.left > openerBox.left + openerBox.width / 2,
        };
    });
}

function overlaps(piece: SpanBox, target: SpanBox): boolean {
    return piece.left < target.right - 1 && piece.right > target.left + 1;
}

describe("front matter selection", () => {
    let browser: Browser;
    let page: Page;

    beforeAll(async () => {
        const opened = await openPlayground(fixture, "context-breakdown");
        browser = opened.browser;
        page = opened.page;
    });

    afterAll(async () => {
        await browser?.close();
    });

    it("covers the raw dashes on the left", async () => {
        const reading = await readSelection(page);
        expect(reading.text).toContain("---");
        expect(reading.dashes).not.toBeNull();
        expect(reading.name).not.toBeNull();
        expect(reading.labelOnRight).toBe(true);
        expect(reading.pieces.some((piece) => overlaps(piece, reading.dashes!))).toBe(true);
        expect(reading.pieces.some((piece) => piece.left < reading.dashes!.left + 2)).toBe(true);
        expect(reading.pieces.every((piece) => piece.left < reading.dashes!.right - 1)).toBe(true);
        expect(reading.pieces.every((piece) => piece.right <= reading.dashes!.right + 12)).toBe(true);
        expect(reading.name!.left).toBeLessThanOrEqual(1);
        await expectLineRangeShot(page, join(here, "screenshots", "selection.png"), {
            from: "---",
            to: "disable-model-invocation",
            fullWidth: [".inline-md-code-line", ".inline-md-lang"],
        });
    });

    it("keeps the front matter newline space and leaves out the line-ending square", async () => {
        const reading = await page.evaluate(async () => {
            const api = window.__inlineMarkdown;
            api.select(0, api.getDocument().length);
            await new Promise((resolve) => {
                requestAnimationFrame(() => requestAnimationFrame(resolve));
            });
            const fold = (value: string | null) => (value ?? "").replaceAll("\u00a0", " ");
            const measure = (needle: string) => {
                const line = [...document.querySelectorAll<HTMLElement>("#editor .view-line")].find((entry) => fold(entry.textContent).includes(needle));
                if (!(line instanceof HTMLElement)) {
                    return null;
                }
                const bounds = line.getBoundingClientRect();
                let textRight = bounds.left;
                for (const span of line.querySelectorAll("span")) {
                    if (span.childElementCount > 0) {
                        continue;
                    }
                    if (fold(span.textContent).trim().length === 0) {
                        continue;
                    }
                    textRight = Math.max(textRight, span.getBoundingClientRect().right);
                }
                const selected = [...document.querySelectorAll<HTMLElement>(".cslr.selected-text")].filter((node) => {
                    const rect = node.getBoundingClientRect();
                    return rect.bottom > bounds.top + 0.5 && rect.top < bounds.bottom - 0.5 && rect.width > 0.5;
                });
                const onText = selected.filter((node) => node.getBoundingClientRect().left < textRight - 1);
                const highlightRight = onText.reduce((right, node) => Math.max(right, node.getBoundingClientRect().right), bounds.left);
                const square = selected.find((node) => node.getBoundingClientRect().left >= textRight - 1) ?? null;
                return {
                    pastEnd: highlightRight - textRight,
                    square: square === null ? null : square.style.width,
                };
            };
            return {
                front: measure("disable-model-invocation"),
                body: measure("Reproduce"),
            };
        });
        expect(reading.front).not.toBeNull();
        expect(reading.body).not.toBeNull();
        expect(reading.front!.square).toBeNull();
        expect(reading.body!.pastEnd).toBeGreaterThan(2);
        expect(Math.abs(reading.front!.pastEnd - reading.body!.pastEnd)).toBeLessThanOrEqual(2);
    });
});
