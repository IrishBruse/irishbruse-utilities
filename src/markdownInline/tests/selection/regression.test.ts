import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { expectEditorShot, openPlayground } from "../../support/browser";
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
                const top = viewLine.getBoundingClientRect().top;
                const onLine = pieces.filter((piece) => Math.abs(piece.getBoundingClientRect().top - top) < 3);
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
        expect(heading?.styles.some((style) => style.bottom === "auto" && style.height !== "")).toBe(true);
        for (const line of body) {
            for (const style of line.styles) {
                expect(style.bottom).toBe("0px");
                expect(style.height).toBe("");
            }
        }
    });

    it("matches the saved picture of a document-wide selection", async () => {
        await expectEditorShot(page, join(here, "screenshots", "selection-all.png"));
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
                const text = fold(document.querySelector("#editor .view-lines")?.innerText ?? "");
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
