import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { expectLineRangeShot, openPlayground } from "../support/browser";
import type { Browser, Page } from "playwright-core";

const here = dirname(fileURLToPath(import.meta.url));
const fixture = "tables/fixtures/case-1.md";

describe("table layout", () => {
    let browser: Browser;
    let page: Page;

    beforeAll(async () => {
        const opened = await openPlayground(fixture, "Keep the caret");
        browser = opened.browser;
        page = opened.page;
        await page.evaluate(() => {
            const api = (window as unknown as {
                __inlineMarkdown: { getDocument(): string; setCursor(offset: number): void };
            }).__inlineMarkdown;
            const source = api.getDocument();
            api.setCursor(source.length);
        });
        await page.waitForFunction(() => document.querySelectorAll(".inline-md-table table").length >= 3);
    });

    afterAll(async () => {
        await browser?.close();
    });

    it("matches the saved picture of the formatted tables", async () => {
        const clip = await expectLineRangeShot(page, join(here, "screenshots", "tables.png"), {
            from: "Tables:",
            to: "Plain text",
        });
        expect(clip.width).toBeLessThan(700);
    });

    it("covers each source line and keeps its line number", async () => {
        await page.waitForFunction(() => {
            const fold = (value: string | null) => (value ?? "").replaceAll("\u00a0", " ");
            const line = [...document.querySelectorAll("#editor .view-line")].find((entry) => fold(entry.textContent).includes("Apple"));
            const box = line?.getBoundingClientRect();
            if (!box || box.height <= 8) {
                return false;
            }
            const hit = document.elementFromPoint(box.left + 28, box.top + box.height / 2);
            return (hit?.closest(".inline-md-table") ?? null) !== null;
        });
        const report = await page.evaluate(() => {
            const fold = (value: string | null) => (value ?? "").replaceAll("\u00a0", " ");
            const lines = [...document.querySelectorAll("#editor .view-line")];
            const line = (needle: string) => lines.find((entry) => fold(entry.textContent).includes(needle));
            const apple = line("Apple");
            const plain = line("Keep the caret");
            const appleBox = apple?.getBoundingClientRect();
            const hit = appleBox && appleBox.height > 0
                ? document.elementFromPoint(appleBox.left + 28, appleBox.top + appleBox.height / 2)
                : null;
            const numbers = [...document.querySelectorAll("#editor .line-numbers")].map((entry) => entry.getBoundingClientRect());
            const covered = ["Fruit", "---", "Apple", "Pear"].map((needle) => {
                const box = line(needle)?.getBoundingClientRect();
                const numbered = box
                    ? numbers.some((entry) => entry.bottom > box.top + 1 && entry.top < box.bottom - 1 && entry.height > 0)
                    : false;
                return { needle, height: box?.height ?? 0, numbered };
            });
            const rule = document.querySelector(".inline-md-table-rule td");
            const ruleStyle = rule instanceof HTMLElement ? getComputedStyle(rule) : null;
            const body = document.querySelector(".inline-md-table tbody td");
            const bodyStyle = body instanceof HTMLElement ? getComputedStyle(body) : null;
            return {
                appleHeight: appleBox?.height ?? 0,
                plainHeight: plain?.getBoundingClientRect().height ?? 0,
                inZone: document.querySelector(".inline-md-table[monaco-view-zone]") !== null,
                hitTable: (hit?.closest(".inline-md-table") ?? null) !== null,
                covered,
                ruleBorder: Number.parseFloat(ruleStyle?.borderTopWidth ?? "0"),
                bodyLeft: Number.parseFloat(bodyStyle?.borderLeftWidth ?? "0"),
                bodyBottom: Number.parseFloat(bodyStyle?.borderBottomWidth ?? "0"),
            };
        });
        expect(report.inZone).toBe(false);
        expect(report.appleHeight).toBeGreaterThan(8);
        expect(report.appleHeight).toBeCloseTo(report.plainHeight, 0);
        expect(report.hitTable).toBe(true);
        expect(report.covered).toEqual([
            { needle: "Fruit", height: expect.closeTo(report.plainHeight, 0), numbered: true },
            { needle: "---", height: expect.closeTo(report.plainHeight, 0), numbered: true },
            { needle: "Apple", height: expect.closeTo(report.plainHeight, 0), numbered: true },
            { needle: "Pear", height: expect.closeTo(report.plainHeight, 0), numbered: true },
        ]);
        expect(report.ruleBorder).toBeGreaterThan(0);
        expect(report.bodyLeft).toBeGreaterThan(0);
        expect(report.bodyBottom).toBe(0);
    });

    it("grows a wrapped cell and keeps the next line number on the next row", async () => {
        await page.setViewportSize({ width: 460, height: 700 });
        await page.evaluate(() => {
            const api = (window as unknown as {
                __inlineMarkdown: { setDocument(text: string): void; setCursor(offset: number): void };
            }).__inlineMarkdown;
            api.setDocument([
                "Keep the caret here while reading.",
                "",
                "| Name | Note |",
                "| --- | --- |",
                "| Short | one two three four five six seven eight nine ten eleven twelve thirteen fourteen |",
                "| Next | row |",
                "",
            ].join("\n"));
            api.setCursor(0);
        });
        await page.waitForFunction(() => {
            const fold = (value: string | null) => (value ?? "").replaceAll("\u00a0", " ");
            const lines = [...document.querySelectorAll("#editor .view-line")];
            const box = (needle: string) => lines.find((entry) => fold(entry.textContent).includes(needle))?.getBoundingClientRect();
            const plain = box("Keep the caret");
            const wrapped = box("Short");
            const next = box("Next");
            if (!plain || !wrapped || !next) {
                return false;
            }
            return next.top > wrapped.top + plain.height + 4;
        });
        const report = await page.evaluate(() => {
            const fold = (value: string | null) => (value ?? "").replaceAll("\u00a0", " ");
            const lines = [...document.querySelectorAll("#editor .view-line")];
            const line = (needle: string) => lines.find((entry) => fold(entry.textContent).includes(needle));
            const plain = line("Keep the caret")?.getBoundingClientRect();
            const wrapped = line("Short")?.getBoundingClientRect();
            const next = line("Next")?.getBoundingClientRect();
            const numbers = [...document.querySelectorAll("#editor .line-numbers")];
            const numberOn = (box: DOMRect | undefined) => box
                ? numbers.filter((entry) => {
                    const bounds = entry.getBoundingClientRect();
                    return bounds.height > 0 && bounds.bottom > box.top + 1 && bounds.top < box.bottom - 1;
                }).map((entry) => (entry.textContent ?? "").trim())
                : [];
            const note = document.querySelector(".inline-md-table td:last-child");
            return {
                plainHeight: plain?.height ?? 0,
                wrappedHeight: next && wrapped ? next.top - wrapped.top : 0,
                nextTop: next?.top ?? 0,
                wrappedBottom: wrapped?.bottom ?? 0,
                wrappedNumbers: numberOn(wrapped),
                nextNumbers: numberOn(next),
                noteWidth: note?.getBoundingClientRect().width ?? 0,
                noteScroll: note instanceof HTMLElement ? note.scrollHeight : 0,
                noteClient: note instanceof HTMLElement ? note.clientHeight : 0,
            };
        });
        expect(report.plainHeight).toBeGreaterThan(8);
        expect(report.wrappedHeight).toBeGreaterThan(report.plainHeight + 4);
        expect(report.nextTop).toBeGreaterThan(report.wrappedBottom - 1);
        expect(report.wrappedNumbers).toHaveLength(1);
        expect(report.nextNumbers).toHaveLength(1);
        expect(report.noteScroll).toBeLessThanOrEqual(report.noteClient + 1);
        expect(report.noteWidth).toBeGreaterThan(20);
    });

    it("keeps short words on one line and wraps the long column", async () => {
        await page.setViewportSize({ width: 780, height: 700 });
        await page.evaluate(() => {
            const api = (window as unknown as {
                __inlineMarkdown: { setDocument(text: string): void; setCursor(offset: number): void };
            }).__inlineMarkdown;
            api.setDocument([
                "Keep the caret here while reading.",
                "",
                "| Name | Role | On | Notes |",
                "| :--- | :--- | :-: | :--- |",
                "| Ada | Engineer | Yes | Long description that should wrap instead of stretching the column forever or forcing Role onto two lines |",
                "| Grace | Architect | No | Another long cell |",
                "",
            ].join("\n"));
            api.setCursor(0);
        });
        await page.waitForFunction(() => {
            const fold = (value: string | null) => (value ?? "").replaceAll("\u00a0", " ");
            const line = [...document.querySelectorAll("#editor .view-line")].find((entry) => fold(entry.textContent).includes("Ada"));
            const height = line?.getBoundingClientRect().height ?? 0;
            return height > 8 && height < 300;
        });
        const report = await page.evaluate(() => {
            const textHeight = (needle: string) => {
                const cell = [...document.querySelectorAll(".inline-md-table td")].find((entry) => (entry.textContent ?? "").includes(needle));
                if (!(cell instanceof HTMLElement)) {
                    return 0;
                }
                const range = document.createRange();
                range.selectNodeContents(cell);
                return range.getBoundingClientRect().height;
            };
            const fold = (value: string | null) => (value ?? "").replaceAll("\u00a0", " ");
            const ada = [...document.querySelectorAll("#editor .view-line")].find((entry) => fold(entry.textContent).includes("Ada"));
            const ruleNode = document.querySelector(".inline-md-table-rule");
            const rule = ruleNode?.getBoundingClientRect();
            const table = document.querySelector(".inline-md-table table")?.getBoundingClientRect();
            const end = document.querySelector(".inline-md-table-rule td:last-child");
            const endStyle = end instanceof HTMLElement ? getComputedStyle(end) : null;
            const ruleCell = document.querySelector(".inline-md-table-rule td");
            const ruleStyle = ruleCell instanceof HTMLElement ? getComputedStyle(ruleCell) : null;
            const lines = document.querySelector("#editor .view-lines")?.getBoundingClientRect();
            const endBox = end?.getBoundingClientRect();
            return {
                ada: ada?.getBoundingClientRect().height ?? 0,
                engineer: textHeight("Engineer"),
                role: textHeight("Architect"),
                notes: textHeight("Long description"),
                ruleWidth: rule?.width ?? 0,
                tableWidth: table?.width ?? 0,
                ruleBorder: Number.parseFloat(ruleStyle?.borderTopWidth ?? "0"),
                rightBorder: Number.parseFloat(endStyle?.borderRightWidth ?? "0"),
                endRight: endBox?.right ?? 0,
                tableRight: table?.right ?? 0,
                linesRight: lines?.right ?? 0,
            };
        });
        expect(report.ada).toBeLessThan(300);
        expect(report.engineer).toBeGreaterThan(8);
        expect(report.engineer).toBeLessThan(report.notes);
        expect(report.role).toBeLessThan(report.notes);
        expect(report.notes).toBeGreaterThan(report.engineer + 4);
        expect(Math.abs(report.ruleWidth - report.tableWidth)).toBeLessThan(2);
        expect(report.ruleBorder).toBeGreaterThanOrEqual(2);
        expect(report.rightBorder).toBeGreaterThanOrEqual(2);
        expect(Math.abs(report.endRight - report.tableRight)).toBeLessThan(1);
        expect(report.endRight).toBeLessThanOrEqual(report.linesRight);
    });
});
