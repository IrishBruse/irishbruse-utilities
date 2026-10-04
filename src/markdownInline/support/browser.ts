import { existsSync, mkdirSync, readFileSync, unlinkSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import pixelmatch from "pixelmatch";
import { PNG } from "pngjs";
import { chromium, type Browser, type Locator, type Page } from "playwright-core";

const playground = "http://127.0.0.1:5175";

async function viteOverlay(page: Page): Promise<string | undefined> {
    const text = await page.evaluate(() => {
        const overlay = document.querySelector("vite-error-overlay");
        return overlay?.shadowRoot?.textContent?.replace(/\s+/g, " ").trim() ?? "";
    }).catch(() => "");
    return text.length > 0 ? text : undefined;
}

async function waitForEditor(page: Page, marker: string | undefined): Promise<true | string> {
    try {
        const handle = await page.waitForFunction((id: string | undefined) => {
            const overlay = document.querySelector("vite-error-overlay");
            const message = overlay?.shadowRoot?.textContent?.replace(/\s+/g, " ").trim();
            if (message) {
                return message;
            }
            if (id === undefined) {
                return typeof (window as unknown as { __inlineMarkdown?: unknown }).__inlineMarkdown !== "undefined" ? true : false;
            }
            const text = (document.querySelector("#editor .view-lines")?.textContent ?? "").replaceAll("\u00a0", " ");
            return text.includes(id) ? true : false;
        }, marker, { timeout: 15_000 });
        const value = await handle.jsonValue();
        return value === true ? true : String(value);
    } catch (error) {
        const overlay = await viteOverlay(page);
        if (overlay) {
            return overlay;
        }
        throw error;
    }
}

export interface BulletLine {
    readonly text: string;
    readonly bulletLeft: number;
    readonly bulletRight: number;
    readonly wordLeft: number;
    readonly hitIsBullet: boolean;
    readonly insideMargin: boolean;
}

export async function openPlayground(fixture: string, marker?: string): Promise<{ browser: Browser; page: Page }> {
    const ready = await fetch(playground).then((response) => response.ok).catch(() => false);
    if (!ready) {
        throw new Error(`Playground is not running at ${playground}/`);
    }
    const browser = await chromium.launch({ channel: "chrome", headless: true });
    const page = await browser.newPage({ viewport: { width: 900, height: 700 } });
    const readyMarker = marker === ""
        ? undefined
        : marker
            ?? (fixture.includes("list/")
                ? "Nested bullet"
                : fixture.includes("skill/")
                    ? "markdown-skill-fixture"
                    : "Hello");
    await page.goto(`${playground}/?fixture=${fixture}`, { waitUntil: "domcontentloaded" });
    let opened = await waitForEditor(page, readyMarker);
    if (opened !== true) {
        await page.reload({ waitUntil: "domcontentloaded" });
        opened = await waitForEditor(page, readyMarker);
        if (opened !== true) {
            throw new Error(opened);
        }
    }
    await page.evaluate(() => document.fonts.ready);
    await page.addStyleTag({
        content: ".monaco-editor .cursors-layer, .monaco-editor .current-line { opacity: 0 !important; }",
    });
    return { browser, page };
}

export async function bulletLines(page: Page, needles: readonly string[]): Promise<BulletLine[]> {
    return page.evaluate((names) => {
        const fold = (value: string | null) => (value ?? "").replaceAll("\u00a0", " ");
        const root = document.querySelector(".inline-md-root");
        const lines = [...document.querySelectorAll("#editor .view-line")];
        const margin = document.querySelector("#editor .margin")?.getBoundingClientRect();
        if (!(root instanceof HTMLElement) || !margin) {
            return [];
        }
        return names.map((needle) => {
            const line = lines.find((entry) => fold(entry.textContent).includes(needle));
            if (!line) {
                return {
                    text: needle,
                    bulletLeft: 0,
                    bulletRight: 0,
                    wordLeft: 0,
                    hitIsBullet: false,
                    insideMargin: false,
                };
            }
            const top = line.getBoundingClientRect().top;
            if (top < 8 || top > window.innerHeight - 24) {
                root.scrollTop += top - Math.min(200, window.innerHeight / 2);
            }
            const shown = [...document.querySelectorAll("#editor .view-line")].find((entry) => fold(entry.textContent).includes(needle));
            const bullet = shown
                ? [...shown.querySelectorAll(".inline-md-list-mark")].find((entry) => entry.childElementCount === 0)
                : undefined;
            const box = bullet?.getBoundingClientRect();
            const word = shown
                ? [...shown.querySelectorAll("span")]
                    .filter((span) => fold(span.textContent).includes(needle))
                    .sort((left, right) => (left.textContent?.length ?? 0) - (right.textContent?.length ?? 0))[0]
                : undefined;
            const hit = box ? document.elementFromPoint(box.left + box.width / 2, box.top + box.height / 2) : null;
            const marginBox = document.querySelector("#editor .margin")?.getBoundingClientRect();
            return {
                text: needle,
                bulletLeft: box?.left ?? 0,
                bulletRight: box?.right ?? 0,
                wordLeft: word?.getBoundingClientRect().left ?? 0,
                hitIsBullet: !!bullet && hit?.closest(".inline-md-list-mark") === bullet,
                insideMargin: !!box && !!marginBox && box.left >= marginBox.left - 1 && box.right <= marginBox.right + 1,
            };
        });
    }, needles);
}

function compareShot(buffer: Buffer, baselinePath: string): void {
    if (!existsSync(baselinePath)) {
        mkdirSync(dirname(baselinePath), { recursive: true });
        writeFileSync(baselinePath, buffer);
        throw new Error(`Wrote ${baselinePath}. Run the browser tests again to compare.`);
    }
    const actual = PNG.sync.read(buffer);
    const expected = PNG.sync.read(readFileSync(baselinePath));
    if (actual.width !== expected.width || actual.height !== expected.height) {
        throw new Error(`Screenshot size ${actual.width}x${actual.height} does not match ${expected.width}x${expected.height}`);
    }
    const diff = new PNG({ width: actual.width, height: actual.height });
    const mismatched = pixelmatch(expected.data, actual.data, diff.data, actual.width, actual.height, { threshold: 0.1 });
    const allowed = Math.round(actual.width * actual.height * 0.002);
    const diffPath = baselinePath.replace(/\.png$/, ".diff.png");
    if (mismatched > allowed) {
        writeFileSync(diffPath, PNG.sync.write(diff));
        throw new Error(`${mismatched} pixels differ from ${baselinePath}. Diff written to ${diffPath}.`);
    }
    if (existsSync(diffPath)) {
        unlinkSync(diffPath);
    }
}

export interface PageClipBox {
    readonly x: number;
    readonly y: number;
    readonly width: number;
    readonly height: number;
}

export interface LineRangeClip {
    readonly from: string;
    readonly to: string;
    readonly pad?: number;
    readonly lineNumbers?: boolean;
    readonly fullWidth?: readonly string[];
}

export async function featureClip(page: Page, options: LineRangeClip): Promise<PageClipBox> {
    const clip = await page.evaluate((options) => {
        const fold = (value: string | null) => (value ?? "").replaceAll("\u00a0", " ");
        const hasNeedle = (text: string, needle: string): boolean => {
            if (!/^[A-Za-z0-9]/.test(needle) || !/[A-Za-z0-9]$/.test(needle)) {
                return text.includes(needle);
            }
            let from = 0;
            while (from < text.length) {
                const index = text.indexOf(needle, from);
                if (index < 0) {
                    return false;
                }
                const before = text[index - 1] ?? "";
                const after = text[index + needle.length] ?? "";
                if (!/[A-Za-z0-9]/.test(before) && !/[A-Za-z0-9]/.test(after)) {
                    return true;
                }
                from = index + needle.length;
            }
            return false;
        };
        const editor = document.querySelector("#editor");
        const content = document.querySelector("#editor .view-lines");
        if (!(editor instanceof HTMLElement) || !(content instanceof HTMLElement)) {
            return null;
        }
        const lines = [...document.querySelectorAll<HTMLElement>("#editor .view-line")];
        const locate = (needle: string, which: "first" | "last"): HTMLElement | null => {
            const ordered = which === "first" ? lines : [...lines].reverse();
            for (const line of ordered) {
                if (hasNeedle(fold(line.textContent), needle)) {
                    return line;
                }
            }
            const walker = document.createTreeWalker(editor, NodeFilter.SHOW_TEXT);
            let hit: HTMLElement | null = null;
            let node = walker.nextNode();
            while (node) {
                if (hasNeedle(fold(node.textContent), needle) && node.parentElement instanceof HTMLElement) {
                    hit = node.parentElement.closest(".inline-md-table table, .inline-md-image-fallback, .view-line") ?? node.parentElement;
                    if (which === "first") {
                        return hit;
                    }
                }
                node = walker.nextNode();
            }
            return hit;
        };
        const start = locate(options.from, "first");
        const end = locate(options.to, "last");
        if (!start || !end) {
            return null;
        }
        const startBox = start.getBoundingClientRect();
        const endBox = end.getBoundingClientRect();
        const contentWidth = content.getBoundingClientRect().width;
        let top = Math.min(startBox.top, endBox.top);
        let bottom = Math.max(startBox.bottom, endBox.bottom);
        let left = Number.POSITIVE_INFINITY;
        let right = Number.NEGATIVE_INFINITY;
        const grow = (box: DOMRect, edge: "all" | "left"): void => {
            if (box.width < 1 || box.height < 1) {
                return;
            }
            top = Math.min(top, box.top);
            bottom = Math.max(bottom, box.bottom);
            left = Math.min(left, box.left);
            if (edge === "all") {
                right = Math.max(right, box.right);
            }
        };
        const band = { top, bottom };
        const overlaps = (box: DOMRect): boolean => box.bottom > band.top + 0.5 && box.top < band.bottom - 0.5;
        const centered = (box: DOMRect): boolean => {
            const center = (box.top + box.bottom) / 2;
            return center >= band.top && center <= band.bottom;
        };
        for (const line of lines) {
            const box = line.getBoundingClientRect();
            if (!centered(box)) {
                continue;
            }
            for (const leaf of line.querySelectorAll("span")) {
                if (leaf.childElementCount > 0 || fold(leaf.textContent).trim().length === 0) {
                    continue;
                }
                const range = document.createRange();
                range.selectNodeContents(leaf);
                const textBox = range.getBoundingClientRect();
                const bleed = textBox.width >= contentWidth * 0.9;
                grow(textBox, bleed ? "left" : "all");
            }
        }
        for (const anchor of [start, end]) {
            if (!anchor.classList.contains("view-line")) {
                grow(anchor.getBoundingClientRect(), "all");
            }
        }
        if (options.lineNumbers !== false) {
            for (const number of document.querySelectorAll("#editor .line-numbers, #editor .inline-md-zone-number")) {
                const box = number.getBoundingClientRect();
                if (centered(box)) {
                    grow(box, "all");
                }
            }
        }
        const extras = options.fullWidth ?? [];
        const widgets = [
            ".inline-md-list-mark",
            ".inline-md-task",
            ".selected-text",
            "img.inline-md-image",
            ".inline-md-image-fallback",
            ".inline-md-table table",
            ".inline-md-hr",
            ".inline-md-hr-line",
            ".inline-md-quote",
            ".inline-md-lang",
            ".inline-md-code-line",
        ];
        for (const selector of widgets) {
            for (const node of document.querySelectorAll(`#editor ${selector}`)) {
                const box = node.getBoundingClientRect();
                if (!overlaps(box)) {
                    continue;
                }
                const bleed = box.width >= contentWidth * 0.9;
                const keepRight = !bleed || extras.some((extra) => node.matches(extra));
                grow(box, keepRight ? "all" : "left");
            }
        }
        if (!Number.isFinite(left) || !Number.isFinite(right) || right <= left) {
            return null;
        }
        const pad = options.pad ?? 8;
        const editorBox = editor.getBoundingClientRect();
        const startTop = start.getBoundingClientRect().top;
        const endBottom = end.getBoundingClientRect().bottom;
        const lineBoxes = lines.map((line) => line.getBoundingClientRect());
        const above = lineBoxes.filter((box) => box.bottom <= startTop + 0.5).sort((a, b) => b.bottom - a.bottom)[0];
        const below = lineBoxes.filter((box) => box.top >= endBottom - 0.5).sort((a, b) => a.top - b.top)[0];
        let y = Math.floor(Math.min(top, startTop) - pad);
        let clipBottom = Math.ceil(Math.max(bottom, endBottom) + pad);
        if (above) {
            y = Math.max(y, Math.ceil(above.bottom));
        }
        if (below) {
            clipBottom = Math.min(clipBottom, Math.floor(below.top));
        }
        y = Math.max(y, Math.ceil(editorBox.top));
        clipBottom = Math.min(clipBottom, Math.floor(editorBox.bottom));
        const x = Math.max(Math.ceil(editorBox.left), Math.floor(left - pad));
        const clipRight = Math.min(Math.floor(editorBox.right), Math.ceil(right + pad));
        if (clipRight - x < 8 || clipBottom - y < 8) {
            return null;
        }
        return { x, y, width: clipRight - x, height: clipBottom - y };
    }, options);
    if (!clip) {
        throw new Error(`No clip for "${options.from}" through "${options.to}".`);
    }
    return clip;
}

export async function expectLocatorShot(locator: Locator, baselinePath: string): Promise<void> {
    compareShot(await locator.screenshot({ animations: "disabled" }), baselinePath);
}

export async function expectEditorShot(page: Page, baselinePath: string): Promise<void> {
    compareShot(await page.locator("#editor").screenshot({ animations: "disabled" }), baselinePath);
}

export async function expectPageClip(
    page: Page,
    clip: { x: number; y: number; width: number; height: number },
    baselinePath: string,
): Promise<void> {
    compareShot(await page.screenshot({ animations: "disabled", clip }), baselinePath);
}

export async function expectLineRangeShot(page: Page, baselinePath: string, options: LineRangeClip): Promise<PageClipBox> {
    const clip = await featureClip(page, options);
    await expectPageClip(page, clip, baselinePath);
    return clip;
}
