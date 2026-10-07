import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { PNG } from "pngjs";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { expectLineRangeShot, openPlayground } from "../support/browser";
import type { Browser, Page } from "playwright-core";

const here = dirname(fileURLToPath(import.meta.url));
const fixture = "selection/fixtures/case-1.md";

interface LineSelectionStyles {
    readonly heading: boolean;
    readonly body: boolean;
    readonly styles: ReadonlyArray<{ readonly height: string; readonly bottom: string }>;
}

async function selectionStylesByLine(page: Page): Promise<LineSelectionStyles[]> {
    return page.evaluate(() => {
        const viewLines = [...document.querySelectorAll("#editor .view-line")];
        const pieces = [...document.querySelectorAll<HTMLElement>(".selected-text")];
        return viewLines
            .map((viewLine) => {
                const bounds = viewLine.getBoundingClientRect();
                const onLine = pieces.filter((piece) => {
                    const rect = piece.getBoundingClientRect();
                    return rect.bottom > bounds.top + 0.5 && rect.top < bounds.bottom - 0.5;
                });
                const text = (viewLine.textContent ?? "").replaceAll("\u00a0", " ").trim();
                return {
                    heading: viewLine.querySelector(".inline-md-h1") !== null,
                    body: viewLine.querySelector(".inline-md-h1") === null && text.length > 0,
                    styles: onLine.map((piece) => ({
                        height: piece.style.height,
                        bottom: piece.style.bottom,
                    })),
                };
            })
            .filter((line) => line.styles.length > 0);
    });
}

describe("selection highlight layout", () => {
    let browser: Browser;
    let page: Page;

    beforeAll(async () => {
        const opened = await openPlayground(fixture, "Second paragraph");
        browser = opened.browser;
        page = opened.page;
        const length = await page.evaluate(() => window.__inlineMarkdown.getDocument().length);
        await page.evaluate((to) => window.__inlineMarkdown.select(0, to), length);
        await page.waitForFunction(() => document.querySelectorAll(".selected-text").length > 0);
    });

    afterAll(async () => {
        await browser?.close();
    });

    it("stretches the highlight on the heading line and keeps body lines at normal height", async () => {
        const lines = await selectionStylesByLine(page);
        const heading = lines.find((line) => line.heading);
        const body = lines.filter((line) => line.body);
        expect(heading?.styles.every((style) => style.bottom === "0px" || style.bottom === "auto")).toBe(true);
        for (const line of body) {
            for (const style of line.styles) {
                expect(style.bottom).toBe("0px");
                expect(style.height).toBe("");
            }
        }
    });

    it("matches the saved picture of a document-wide selection", async () => {
        const clip = await expectLineRangeShot(page, join(here, "screenshots", "selection-all.png"), {
            from: "Main title",
            to: "Second paragraph",
        });
        expect(clip.width).toBeLessThan(700);
    });
});

async function taskLineSelectionGap(page: Page): Promise<number> {
    return page.evaluate(async () => {
        const doc = window.__inlineMarkdown.getDocument();
        const from = doc.indexOf("- [ ] Task");
        const to = doc.indexOf("const value") + 14;
        window.__inlineMarkdown.select(from, to);
        await new Promise((resolve) => {
            requestAnimationFrame(() => requestAnimationFrame(resolve));
        });
        const fold = (value: string | null) => (value ?? "").replaceAll("\u00a0", " ");
        const line = [...document.querySelectorAll("#editor .view-line")].find((entry) => fold(entry.textContent).includes("Task"));
        if (!(line instanceof HTMLElement)) {
            return Number.POSITIVE_INFINITY;
        }
        const top = line.getBoundingClientRect().top;
        const pieces = [...document.querySelectorAll<HTMLElement>(".selected-text")].filter(
            (piece) => Math.abs(piece.getBoundingClientRect().top - top) < 3,
        );
        pieces.sort((left, right) => left.getBoundingClientRect().left - right.getBoundingClientRect().left);
        const lineLeft = line.getBoundingClientRect().left;
        const firstPieceLeft = pieces[0]?.getBoundingClientRect().left ?? Number.POSITIVE_INFINITY;
        return Math.max(0, firstPieceLeft - lineLeft);
    });
}

describe("task list selection highlight", () => {
    let browser: Browser;
    let page: Page;

    beforeAll(async () => {
        const opened = await openPlayground("selection/fixtures/case-3.md", "Task");
        browser = opened.browser;
        page = opened.page;
    });

    afterAll(async () => {
        await browser?.close();
    });

    it("starts the highlight at the task line edge when the selection continues below", async () => {
        const gap = await taskLineSelectionGap(page);
        expect(gap).toBeLessThanOrEqual(1);
    });

    it("reveals the link address while the mouse is still down on a drag selection", async () => {
        const opened = await openPlayground("selection/fixtures/case-4.md", "Example link");
        const dragPage = opened.page;
        try {
            const revealed = await dragPage.evaluate(async () => {
                const root = document.querySelector(".inline-md-root");
                root?.dispatchEvent(new MouseEvent("mousedown", { bubbles: true, button: 0, cancelable: true }));
                const doc = window.__inlineMarkdown.getDocument();
                window.__inlineMarkdown.select(0, doc.length);
                await new Promise((resolve) => {
                    requestAnimationFrame(() => requestAnimationFrame(resolve));
                });
                const fold = (value: string | null) => (value ?? "").replaceAll("\u00a0", " ");
                const view = document.querySelector("#editor .view-lines");
                const text = fold(view instanceof HTMLElement ? view.innerText : "");
                const dragging = root?.classList.contains("inline-md-dragging") === true;
                window.dispatchEvent(new MouseEvent("mouseup"));
                return dragging && text.includes("(https://");
            });
            expect(revealed).toBe(true);
        } finally {
            await opened.browser.close();
        }
    });

    it("reveals task markers instead of leaving a formatted checkbox in the selection", async () => {
        const formatted = await page.evaluate(async () => {
            const doc = window.__inlineMarkdown.getDocument();
            const from = doc.indexOf("- [ ] Task");
            const to = doc.indexOf("const value") + 14;
            window.__inlineMarkdown.select(from, to);
            await new Promise((resolve) => {
                requestAnimationFrame(() => requestAnimationFrame(resolve));
            });
            return document.querySelector(".inline-md-task") !== null;
        });
        expect(formatted).toBe(false);
    });
});

async function maxSelectionGapOnLine(page: Page, needle: string): Promise<number> {
    return page.evaluate((lineNeedle) => {
        const fold = (value: string | null) => (value ?? "").replaceAll("\u00a0", " ");
        const line = [...document.querySelectorAll("#editor .view-line")].find((entry) => fold(entry.textContent).includes(lineNeedle));
        if (!(line instanceof HTMLElement)) {
            return Number.POSITIVE_INFINITY;
        }
        const top = line.getBoundingClientRect().top;
        const pieces = [...document.querySelectorAll<HTMLElement>(".selected-text")].filter(
            (piece) => Math.abs(piece.getBoundingClientRect().top - top) < 3,
        );
        pieces.sort((left, right) => left.getBoundingClientRect().left - right.getBoundingClientRect().left);
        let maxGap = 0;
        for (let index = 1; index < pieces.length; index += 1) {
            const gap = pieces[index].getBoundingClientRect().left - pieces[index - 1].getBoundingClientRect().right;
            maxGap = Math.max(maxGap, gap);
        }
        const lineLeft = line.getBoundingClientRect().left;
        const firstLeft = pieces[0]?.getBoundingClientRect().left ?? Number.POSITIVE_INFINITY;
        return Math.max(maxGap, Math.max(0, firstLeft - lineLeft));
    }, needle);
}

describe("task line selection picture", () => {
    let browser: Browser;
    let page: Page;

    beforeAll(async () => {
        const opened = await openPlayground("selection/fixtures/case-5.md", "Quote line");
        browser = opened.browser;
        page = opened.page;
        await page.evaluate(async () => {
            const doc = window.__inlineMarkdown.getDocument();
            const from = doc.indexOf("> Quote");
            window.__inlineMarkdown.select(from, doc.length);
            await new Promise((resolve) => {
                requestAnimationFrame(() => requestAnimationFrame(resolve));
            });
        });
        await page.waitForFunction(() => document.querySelectorAll(".selected-text").length > 0);
    });

    afterAll(async () => {
        await browser?.close();
    });

    it("keeps one continuous highlight band on the task line", async () => {
        expect(await maxSelectionGapOnLine(page, "Task")).toBeLessThanOrEqual(1);
    });

    it("matches the saved picture of the task line selection", async () => {
        const clip = await expectLineRangeShot(page, join(here, "screenshots", "task-line-selection.png"), {
            from: "- [ ] Task",
            to: "Still selected",
        });
        expect(clip.width).toBeLessThan(500);
    });
});

describe("untouched marks on a selected line", () => {
    let browser: Browser;
    let page: Page;

    beforeAll(async () => {
        const opened = await openPlayground("selection/fixtures/case-6.md", "plain");
        browser = opened.browser;
        page = opened.page;
    });

    afterAll(async () => {
        await browser?.close();
    });

    it("keeps marks previewed when the selection does not touch them", async () => {
        const text = await page.evaluate(async () => {
            const root = document.querySelector(".inline-md-root");
            root?.dispatchEvent(new MouseEvent("mousedown", { bubbles: true, button: 0, cancelable: true }));
            const doc = window.__inlineMarkdown.getDocument();
            const from = doc.indexOf(" and ");
            const to = from + " and ".length;
            window.__inlineMarkdown.select(from, to);
            await new Promise((resolve) => {
                requestAnimationFrame(() => requestAnimationFrame(resolve));
            });
            const fold = (value: string | null) => (value ?? "").replaceAll("\u00a0", " ");
            const view = document.querySelector("#editor .view-lines");
            const shown = fold(view instanceof HTMLElement ? view.innerText : "");
            window.dispatchEvent(new MouseEvent("mouseup"));
            return shown;
        });
        expect(text).toContain("plain bold and italic then code and link end");
        expect(text).not.toContain("**");
        expect(text).not.toContain("`");
        expect(text).not.toContain("https://");
    });
});

describe("click inside a selection", () => {
    let browser: Browser;
    let page: Page;

    beforeAll(async () => {
        const opened = await openPlayground(fixture, "First paragraph");
        browser = opened.browser;
        page = opened.page;
    });

    afterAll(async () => {
        await browser?.close();
    });

    it("places the caret where the selected text was clicked", async () => {
        const target = await page.evaluate(async () => {
            const doc = window.__inlineMarkdown.getDocument();
            const needle = "First paragraph under the title.";
            const from = doc.indexOf(needle);
            const to = from + needle.length;
            window.__inlineMarkdown.select(from, to);
            await new Promise((resolve) => {
                requestAnimationFrame(() => requestAnimationFrame(resolve));
            });
            const piece = document.querySelector<HTMLElement>(".selected-text");
            const box = piece?.getBoundingClientRect();
            return {
                from,
                to,
                pieces: document.querySelectorAll(".selected-text").length,
                x: box ? box.left + box.width / 2 : 0,
                y: box ? box.top + box.height / 2 : 0,
            };
        });
        expect(target.from).toBeGreaterThanOrEqual(0);
        expect(target.pieces).toBeGreaterThan(0);
        await page.mouse.click(target.x, target.y);
        await page.evaluate(() => new Promise((resolve) => {
            requestAnimationFrame(() => requestAnimationFrame(resolve));
        }));
        const placed = await page.evaluate(() => ({
            cursor: window.__inlineMarkdown.getCursor(),
            pieces: document.querySelectorAll(".selected-text").length,
        }));
        expect(placed.cursor).toBeGreaterThan(target.from);
        expect(placed.cursor).toBeLessThan(target.to);
        expect(placed.pieces).toBe(0);

        const outside = await page.evaluate(async () => {
            const doc = window.__inlineMarkdown.getDocument();
            const needle = "First paragraph under the title.";
            const from = doc.indexOf(needle);
            window.__inlineMarkdown.select(from, from + needle.length);
            await new Promise((resolve) => {
                requestAnimationFrame(() => requestAnimationFrame(resolve));
            });
            const fold = (value: string | null) => (value ?? "").replaceAll("\u00a0", " ");
            const line = [...document.querySelectorAll("#editor .view-line")].find((entry) => fold(entry.textContent).includes("Second paragraph"));
            const spans = [...(line?.querySelectorAll("span") ?? [])].filter((span) => fold(span.textContent).includes("Second"));
            spans.sort((left, right) => (left.textContent?.length ?? 0) - (right.textContent?.length ?? 0));
            const box = spans[0]?.getBoundingClientRect();
            return {
                from,
                to: from + needle.length,
                at: doc.indexOf("Second"),
                x: box ? box.left + Math.min(8, box.width / 2) : 0,
                y: box ? box.top + box.height / 2 : 0,
            };
        });
        expect(outside.at).toBeGreaterThanOrEqual(outside.to);
        await page.mouse.click(outside.x, outside.y);
        await page.evaluate(() => new Promise((resolve) => {
            requestAnimationFrame(() => requestAnimationFrame(resolve));
        }));
        const moved = await page.evaluate(() => window.__inlineMarkdown.getCursor());
        expect(moved).toBeGreaterThanOrEqual(outside.at);
        expect(moved).toBeLessThan(outside.at + "Second".length);
    });
});

describe("heading selection highlight", () => {
    let browser: Browser;
    let page: Page;

    beforeAll(async () => {
        const opened = await openPlayground("selection/fixtures/case-7.md", "Text above the heading");
        browser = opened.browser;
        page = opened.page;
        await page.evaluate(() => {
            const api = window.__inlineMarkdown;
            api.focus();
            const doc = api.getDocument();
            const start = doc.indexOf("# Hello");
            api.select(start, doc.indexOf("\n", start));
        });
        await page.waitForFunction(() => document.querySelectorAll(".selected-text").length > 0);
        await page.evaluate(() => new Promise((resolve) => {
            requestAnimationFrame(() => requestAnimationFrame(resolve));
        }));
    });

    afterAll(async () => {
        await browser?.close();
    });

    it("wraps the heading glyphs in one rounded selection", async () => {
        const layout = await page.evaluate(() => {
            const line = [...document.querySelectorAll<HTMLElement>("#editor .view-line")].find((entry) => {
                return (entry.textContent ?? "").replaceAll("\u00a0", " ").includes("Hello");
            });
            const heading = line?.querySelector(".inline-md-h1");
            const piece = document.querySelector<HTMLElement>(".selected-text");
            if (!(line instanceof HTMLElement) || !(heading instanceof HTMLElement) || !piece) {
                return null;
            }
            const text = heading.getBoundingClientRect();
            const band = piece.getBoundingClientRect();
            return {
                count: document.querySelectorAll(".selected-text").length,
                past: band.right - text.right,
                contains: band.top <= text.top + 1 && band.bottom >= text.bottom - 1,
                rounded: piece.classList.contains("top-left-radius")
                    && piece.classList.contains("top-right-radius")
                    && piece.classList.contains("bottom-left-radius")
                    && piece.classList.contains("bottom-right-radius"),
            };
        });
        expect(layout).not.toBeNull();
        expect(layout!.count).toBe(1);
        expect(layout!.rounded).toBe(true);
        expect(layout!.contains).toBe(true);
        expect(layout!.past).toBeGreaterThan(2);
        expect(layout!.past).toBeLessThan(16);
    });

    it("matches the saved picture of selection across the heading", async () => {
        const clip = await expectLineRangeShot(page, join(here, "screenshots", "heading-selection-case-7.png"), {
            from: "Text above the heading",
            to: "A paragraph with more text",
            lineNumbers: true,
        });
        expect(clip.height).toBeLessThan(120);
    });
});

function channelDistance(left: readonly number[], right: readonly number[]): number {
    return Math.abs(left[0] - right[0]) + Math.abs(left[1] - right[1]) + Math.abs(left[2] - right[2]);
}

function parseRgb(value: string): [number, number, number] {
    const match = /rgb\((\d+),\s*(\d+),\s*(\d+)\)/.exec(value);
    if (!match) {
        return [0, 0, 0];
    }
    return [Number(match[1]), Number(match[2]), Number(match[3])];
}

describe("wrapped paragraph selection corners", () => {
    let browser: Browser;
    let page: Page;

    beforeAll(async () => {
        const opened = await openPlayground("selection/fixtures/case-8.md", "hands-on checks");
        browser = opened.browser;
        page = opened.page;
    });

    afterAll(async () => {
        await browser?.close();
    });

    it("does not show an extra box at the start or the end", async () => {
        const sample = await page.evaluate(async () => {
            const api = window.__inlineMarkdown;
            api.focus();
            const doc = api.getDocument();
            const from = doc.indexOf("hands-on checks");
            const endNeedle = "already open).";
            const to = doc.indexOf(endNeedle) + endNeedle.length;
            api.select(from, to);
            await new Promise((resolve) => {
                requestAnimationFrame(() => requestAnimationFrame(resolve));
            });
            const editor = document.querySelector("#editor .monaco-editor");
            const pieces = [...document.querySelectorAll<HTMLElement>(".selected-text")].map((piece) => {
                const box = piece.getBoundingClientRect();
                return {
                    left: box.left,
                    right: box.right,
                    top: box.top,
                    width: box.width,
                    x: box.left + box.width / 2,
                    y: box.top + box.height / 2,
                };
            });
            const bands = pieces.filter((piece) => piece.width > 12);
            const caps = pieces.filter((piece) => piece.width <= 12);
            const sameRow = (cap: { top: number }, band: { top: number }) => Math.abs(cap.top - band.top) < 3;
            const starts = caps.filter((cap) => bands.some((band) => sameRow(cap, band) && cap.right <= band.left + 1));
            const ends = caps.filter((cap) => bands.some((band) => sameRow(cap, band) && cap.left >= band.right - 1));
            return {
                from,
                to,
                dpr: window.devicePixelRatio,
                background: editor instanceof HTMLElement ? getComputedStyle(editor).backgroundColor : "",
                selection: caps[0] ? getComputedStyle(document.querySelector(".selected-text")!).backgroundColor : "",
                caps,
                starts: starts.length,
                ends: ends.length,
            };
        });
        expect(sample.from).toBeGreaterThanOrEqual(0);
        expect(sample.to).toBeGreaterThan(sample.from);
        expect(sample.starts).toBeGreaterThan(0);
        expect(sample.ends).toBeGreaterThan(0);
        const background = parseRgb(sample.background);
        const selection = parseRgb(sample.selection);
        const png = PNG.sync.read(await page.screenshot({ animations: "disabled" }));
        for (const cap of sample.caps) {
            const px = Math.round(cap.x * sample.dpr);
            const py = Math.round(cap.y * sample.dpr);
            const index = (py * png.width + px) * 4;
            const color = [png.data[index], png.data[index + 1], png.data[index + 2]];
            expect(channelDistance(color, background)).toBeLessThan(channelDistance(color, selection));
        }
    });
});
