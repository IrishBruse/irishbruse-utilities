import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { openPlayground } from "../../support/browser";
import type { Browser, Page } from "playwright-core";

interface Mark {
    readonly editorText: string;
    readonly className: string;
    readonly fontWeight: number;
    readonly fontStyle: string;
    readonly textDecorationLine: string;
    readonly fontSize: number;
    readonly color: string;
    readonly backgroundColor: string;
    readonly neighborFontWeight: number;
    readonly neighborFontStyle: string;
    readonly neighborDecoration: string;
    readonly neighborColor: string;
    readonly neighborBackground: string;
    readonly hit: boolean;
    readonly sharesEdge: boolean;
}

function describeFixture(title: string, fixture: string, marker: string, tests: (page: () => Page) => void): void {
    describe(title, () => {
        let browser: Browser;
        let page: Page;

        beforeAll(async () => {
            const opened = await openPlayground(fixture, marker);
            browser = opened.browser;
            page = opened.page;
            await page.evaluate(() => {
                const api = (window as unknown as {
                    __inlineMarkdown: { getDocument(): string; setCursor(offset: number): void };
                }).__inlineMarkdown;
                api.setCursor(api.getDocument().length);
            });
        });

        afterAll(async () => {
            await browser?.close();
        });

        tests(() => page);
    });
}

async function readMark(page: Page, word: string, className: string): Promise<Mark> {
    const mark = await page.waitForFunction(({ word, className }) => {
        const fold = (value: string | null) => (value ?? "").replaceAll("\u00a0", " ");
        const spans = [...document.querySelectorAll("#editor .view-line span")];
        const span = spans.find((entry) => fold(entry.textContent) === word && entry.classList.contains(className));
        const marker = span?.previousElementSibling;
        if (!(span instanceof HTMLElement) || !(marker instanceof HTMLElement) || !marker.classList.contains("inline-md-hidden")) {
            return null;
        }
        const box = span.getBoundingClientRect();
        if (box.width <= 0 || box.height <= 0) {
            return null;
        }
        const neighbor = spans.find((entry) => {
            const text = fold(entry.textContent);
            return text.includes("sentence") && !entry.classList.contains(className);
        });
        const neighborStyle = neighbor instanceof HTMLElement ? getComputedStyle(neighbor) : undefined;
        const style = getComputedStyle(span);
        const previous = span.previousElementSibling?.getBoundingClientRect();
        const hit = document.elementFromPoint(box.left + box.width / 2, box.top + box.height / 2);
        return {
            editorText: fold(document.querySelector("#editor .view-lines")?.innerText ?? ""),
            className: span.className,
            fontWeight: Number.parseInt(style.fontWeight, 10),
            fontStyle: style.fontStyle,
            textDecorationLine: style.textDecorationLine,
            fontSize: Number.parseFloat(style.fontSize),
            color: style.color,
            backgroundColor: style.backgroundColor,
            neighborFontWeight: neighborStyle ? Number.parseInt(neighborStyle.fontWeight, 10) : 0,
            neighborFontStyle: neighborStyle?.fontStyle ?? "",
            neighborDecoration: neighborStyle?.textDecorationLine ?? "",
            neighborColor: neighborStyle?.color ?? "",
            neighborBackground: neighborStyle?.backgroundColor ?? "",
            hit: hit instanceof Element && hit.classList.contains(className),
            sharesEdge: !!previous && Math.abs(previous.right - box.left) <= 1 && Math.abs(previous.top - box.top) <= 2,
        };
    }, { word, className });
    return mark.jsonValue() as Promise<Mark>;
}

describeFixture("basic/fixtures/case-1.md headings", "basic/fixtures/case-1.md", "Main heading", (page) => {
    it("paints each heading larger than the one under it and hides the hash marks", async () => {
        const main = await readMark(page(), "Main heading", "inline-md-h1");
        const section = await readMark(page(), "Section heading", "inline-md-h2");
        const smaller = await readMark(page(), "Smaller heading", "inline-md-h3");
        expect(main.editorText).toContain("Main heading");
        expect(main.editorText).toContain("Section heading");
        expect(main.editorText).toContain("Smaller heading");
        expect(main.editorText).not.toContain("#");
        expect(main.fontSize).toBeGreaterThan(section.fontSize);
        expect(section.fontSize).toBeGreaterThan(smaller.fontSize);
        expect(main.hit).toBe(true);
        expect(section.hit).toBe(true);
        expect(smaller.hit).toBe(true);
        expect(main.sharesEdge).toBe(true);
        expect(section.sharesEdge).toBe(true);
        expect(smaller.sharesEdge).toBe(true);
    });
});

describeFixture("basic/fixtures/case-2.md bold", "basic/fixtures/case-2.md", "bold", (page) => {
    it("makes the word heavier than the words beside it and hides the asterisks", async () => {
        const mark = await readMark(page(), "bold", "inline-md-strong");
        expect(mark.editorText).toBe("A bold word in a sentence.");
        expect(mark.fontWeight).toBeGreaterThan(mark.neighborFontWeight);
        expect(mark.hit).toBe(true);
        expect(mark.sharesEdge).toBe(true);
    });
});

describeFixture("basic/fixtures/case-3.md italic", "basic/fixtures/case-3.md", "italic", (page) => {
    it("slants the word and hides the asterisk", async () => {
        const mark = await readMark(page(), "italic", "inline-md-em");
        expect(mark.editorText).toBe("An italic word in a sentence.");
        expect(mark.fontStyle).toBe("italic");
        expect(mark.neighborFontStyle).toBe("normal");
        expect(mark.hit).toBe(true);
        expect(mark.sharesEdge).toBe(true);
    });
});

describeFixture("basic/fixtures/case-4.md strikethrough", "basic/fixtures/case-4.md", "struck", (page) => {
    it("crosses out the word and hides the tildes", async () => {
        const mark = await readMark(page(), "struck", "inline-md-strike");
        expect(mark.editorText).toBe("A struck word in a sentence.");
        expect(mark.textDecorationLine).toContain("line-through");
        expect(mark.neighborDecoration).not.toContain("line-through");
        expect(mark.hit).toBe(true);
        expect(mark.sharesEdge).toBe(true);
    });
});

describeFixture("basic/fixtures/case-5.md inline code", "basic/fixtures/case-5.md", "coded", (page) => {
    it("paints the word in a code face and hides the backticks", async () => {
        const mark = await readMark(page(), "coded", "inline-md-code");
        expect(mark.editorText).toBe("A coded word in a sentence.");
        expect(mark.color).not.toBe(mark.neighborColor);
        expect(mark.backgroundColor).not.toBe(mark.neighborBackground);
        expect(mark.hit).toBe(true);
        expect(mark.sharesEdge).toBe(true);
    });
});

describeFixture("basic/fixtures/case-6.md link", "basic/fixtures/case-6.md", "link label", (page) => {
    it("colors the label, hides the address, and lines the label up with the link", async () => {
        const mark = await readMark(page(), "link label", "inline-md-link");
        expect(mark.editorText).toBe("A link label in a sentence.");
        expect(mark.color).not.toBe(mark.neighborColor);
        expect(mark.hit).toBe(true);
        expect(mark.sharesEdge).toBe(true);
    });
});
