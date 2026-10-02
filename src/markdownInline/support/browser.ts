import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
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
        content: ".monaco-editor .cursors-layer { opacity: 0 !important; }",
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
            const bullet = [...document.querySelectorAll("#editor .margin-view-overlays .inline-md-list-bullet")].find((entry) => {
                return shown !== undefined && Math.abs(entry.getBoundingClientRect().top - shown.getBoundingClientRect().top) <= 2;
            });
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
                hitIsBullet: !!bullet && hit?.closest(".inline-md-list-bullet") === bullet,
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
    if (mismatched > allowed) {
        const diffPath = baselinePath.replace(/\.png$/, ".diff.png");
        writeFileSync(diffPath, PNG.sync.write(diff));
        throw new Error(`${mismatched} pixels differ from ${baselinePath}. Diff written to ${diffPath}.`);
    }
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
