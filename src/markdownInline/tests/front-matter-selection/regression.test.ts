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
        expect(reading.pieces.every((piece) => piece.left < reading.dashes!.right - 1)).toBe(true);
        expect(reading.pieces.every((piece) => piece.right <= reading.dashes!.right + 2)).toBe(true);
        expect(reading.name!.left).toBeLessThanOrEqual(1);
        await expectLineRangeShot(page, join(here, "screenshots", "selection.png"), {
            from: "---",
            to: "disable-model-invocation",
            fullWidth: [".inline-md-code-line", ".inline-md-lang"],
        });
    });
});
