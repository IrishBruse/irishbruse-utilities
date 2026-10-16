import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, describe, expect, it } from "vite-plus/test";
import { expectLocatorShot, openPlayground } from "../../../../test/support/browser";
import type { Browser, Page } from "playwright-core";

const here = dirname(fileURLToPath(import.meta.url));

const fixture = "markdown/fence/mermaid/test/fixtures/case-1.md";

describe("mermaid open preview", () => {
    let browser: Browser;
    let page: Page;

    beforeAll(async () => {
        const opened = await openPlayground(fixture, "Before the fence.");
        browser = opened.browser;
        page = opened.page;
        await page.evaluate(() => {
            const api = (
                window as unknown as {
                    __inlineMarkdown: { getDocument(): string; setCursor(offset: number): void };
                }
            ).__inlineMarkdown;
            api.setCursor(api.getDocument().indexOf("Before"));
        });
        await page.waitForFunction(() => {
            const frame = document.querySelector(".inline-md-mermaid");
            const button = frame?.querySelector(".inline-md-mermaid-open-preview");
            const svg = frame?.querySelector(".inline-md-mermaid-diagram svg");
            if (
                !(frame instanceof HTMLElement) ||
                !(button instanceof HTMLElement) ||
                !(svg instanceof SVGElement)
            ) {
                return false;
            }
            const frameBox = frame.getBoundingClientRect();
            const buttonBox = button.getBoundingClientRect();
            const svgBox = svg.getBoundingClientRect();
            return (
                buttonBox.height > 0 &&
                svgBox.height > 20 &&
                buttonBox.top >= frameBox.top - 1 &&
                buttonBox.right <= frameBox.right + 1 &&
                frameBox.right - buttonBox.right <= 24 &&
                buttonBox.top - frameBox.top <= 12 &&
                svgBox.bottom <= frameBox.bottom + 1
            );
        });
    }, 45_000);

    afterAll(async () => {
        await browser?.close();
    });

    it("floats Open Preview in the top right of the code block", async () => {
        const boxes = await page.evaluate(() => {
            const frame = document.querySelector(".inline-md-mermaid");
            const button = frame?.querySelector(".inline-md-mermaid-open-preview");
            const svg = frame?.querySelector(".inline-md-mermaid-diagram svg");
            if (
                !(frame instanceof HTMLElement) ||
                !(button instanceof HTMLElement) ||
                !(svg instanceof SVGElement)
            ) {
                return null;
            }
            const frameBox = frame.getBoundingClientRect();
            const buttonBox = button.getBoundingClientRect();
            const svgBox = svg.getBoundingClientRect();
            const lensOverlap = [...document.querySelectorAll(".codelens-decoration")].some(
                (node) => {
                    if (
                        !(node instanceof HTMLElement) ||
                        !node.textContent?.includes("Open Preview")
                    ) {
                        return false;
                    }
                    const lens = node.getBoundingClientRect();
                    return (
                        lens.width > 0 &&
                        lens.height > 0 &&
                        lens.bottom > svgBox.top &&
                        lens.top < svgBox.bottom
                    );
                },
            );
            return {
                rightGap: frameBox.right - buttonBox.right,
                topGap: buttonBox.top - frameBox.top,
                svgBottom: svgBox.bottom,
                frameBottom: frameBox.bottom,
                lensOverlap,
            };
        });
        expect(boxes).not.toBeNull();
        expect(boxes!.rightGap).toBeLessThanOrEqual(24);
        expect(boxes!.topGap).toBeLessThanOrEqual(12);
        expect(boxes!.svgBottom).toBeLessThanOrEqual(boxes!.frameBottom + 1);
        expect(boxes!.lensOverlap).toBe(false);
    });

    it("lines the diagram up with the code block", async () => {
        const edges = await page.evaluate(() => {
            const fold = (value: string | null) => (value ?? "").replaceAll("\u00a0", " ");
            const code = [...document.querySelectorAll("#editor .view-line")].find((line) =>
                fold(line.textContent).includes("const value"),
            );
            const text = code
                ? [...code.querySelectorAll("span")].find((node) =>
                      fold(node.textContent).includes("const"),
                  )
                : undefined;
            const frame = document.querySelector(".inline-md-mermaid");
            const svg = frame?.querySelector(".inline-md-mermaid-diagram svg");
            if (
                !(code instanceof HTMLElement) ||
                !(text instanceof HTMLElement) ||
                !(frame instanceof HTMLElement) ||
                !(svg instanceof SVGElement)
            ) {
                return null;
            }
            return {
                codeLeft: code.getBoundingClientRect().left,
                textLeft: text.getBoundingClientRect().left,
                frameLeft: frame.getBoundingClientRect().left,
                svgLeft: svg.getBoundingClientRect().left,
            };
        });
        expect(edges).not.toBeNull();
        expect(Math.abs(edges!.frameLeft - edges!.codeLeft)).toBeLessThanOrEqual(1);
        expect(Math.abs(edges!.svgLeft - edges!.textLeft)).toBeLessThanOrEqual(1);
    });

    it("shows Open Preview in the top right of the code block", async () => {
        await expectLocatorShot(
            page.locator(".inline-md-mermaid"),
            join(here, "screenshots", "mermaid.png"),
        );
    });

    it("keeps Open Preview in the top right while editing the fence", async () => {
        await page.evaluate(() => {
            const api = (
                window as unknown as {
                    __inlineMarkdown: { getDocument(): string; setCursor(offset: number): void };
                }
            ).__inlineMarkdown;
            api.setCursor(api.getDocument().indexOf("flowchart"));
        });
        await page.waitForFunction(() => {
            const button = document.querySelector(".inline-md-mermaid-open-preview-lens");
            const codeLine = [...document.querySelectorAll("#editor .view-line")].find((line) =>
                (line.textContent ?? "").includes("```mermaid"),
            );
            if (!(button instanceof HTMLElement) || !(codeLine instanceof HTMLElement)) {
                return false;
            }
            const buttonBox = button.getBoundingClientRect();
            const lineBox = codeLine.getBoundingClientRect();
            return (
                buttonBox.height > 0 &&
                Math.abs(buttonBox.top - lineBox.top) <= 4 &&
                lineBox.right - buttonBox.right <= 24
            );
        });
        const boxes = await page.evaluate(() => {
            const button = document.querySelector(".inline-md-mermaid-open-preview-lens");
            const codeLine = [...document.querySelectorAll("#editor .view-line")].find((line) =>
                (line.textContent ?? "").includes("```mermaid"),
            );
            const lens = [...document.querySelectorAll(".codelens-decoration")].find((node) =>
                node.textContent?.includes("Open Preview"),
            );
            if (!(button instanceof HTMLElement) || !(codeLine instanceof HTMLElement)) {
                return null;
            }
            const buttonBox = button.getBoundingClientRect();
            const lineBox = codeLine.getBoundingClientRect();
            const lensBox =
                lens instanceof HTMLElement ? lens.getBoundingClientRect() : { height: 0 };
            return {
                topGap: Math.abs(buttonBox.top - lineBox.top),
                rightGap: lineBox.right - buttonBox.right,
                lensHeight: lensBox.height,
            };
        });
        expect(boxes).not.toBeNull();
        expect(boxes!.topGap).toBeLessThanOrEqual(4);
        expect(boxes!.rightGap).toBeLessThanOrEqual(24);
        expect(boxes!.lensHeight).toBe(0);
        await page.evaluate(() => {
            const api = (
                window as unknown as {
                    __inlineMarkdown: { getDocument(): string; setCursor(offset: number): void };
                }
            ).__inlineMarkdown;
            api.setCursor(api.getDocument().indexOf("Before"));
        });
    });
});
