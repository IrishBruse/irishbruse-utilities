import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

const pendingRenders: Array<{
    resolve: (value: { svg: string }) => void;
    reject: (reason?: unknown) => void;
}> = [];

vi.mock("mermaid", () => ({
    default: {
        initialize: () => undefined,
        render: () =>
            new Promise<{ svg: string }>((resolve, reject) => {
                pendingRenders.push({ resolve, reject });
            }),
    },
}));

vi.mock("../../../mermaidEditor/vsCodeTheme.browser", () => ({
    applyWorkbenchMermaidTokens: () => ({}),
    getWorkbenchMermaidInit: () => ({ themeVariables: {}, themeCSS: "" }),
}));

class FakeSvg {
    heightAttr: string | null = null;
    viewBox = { baseVal: { height: 0 } };
    bboxHeight = 0;
    getAttribute(name: string): string | null {
        return name === "height" ? this.heightAttr : null;
    }
    getBBox(): { height: number } {
        return { height: this.bboxHeight };
    }
}

class FakeElement {
    isConnected = false;
    scrollHeight = 10;
    dataset: Record<string, string> = {};
    style = { cssText: "" };
    textContent = "";
    attributes: Record<string, string> = {};
    classes = new Set<string>();
    private html = "";
    classList = {
        add: (name: string) => {
            this.classes.add(name);
        },
        remove: (name: string) => {
            this.classes.delete(name);
        },
    };
    setAttribute(name: string, value: string): void {
        this.attributes[name] = value;
    }
    replaceChildren(): void {
        this.html = "";
    }
    remove(): void {}
    get innerHTML(): string {
        return this.html;
    }
    set innerHTML(value: string) {
        this.html = value;
    }
    querySelector(selector: string): FakeSvg | null {
        if (selector !== "svg" || !this.html.includes("<svg")) {
            return null;
        }
        const node = new FakeSvg();
        node.heightAttr = /height="([^"]*)"/.exec(this.html)?.[1] ?? null;
        const viewBox = /viewBox="([^"]*)"/.exec(this.html)?.[1];
        if (viewBox) {
            const parts = viewBox.trim().split(/[\s,]+/);
            const height = Number(parts[parts.length - 1]);
            if (Number.isFinite(height)) {
                node.viewBox.baseVal.height = height;
            }
        }
        const bbox = /data-bbox="([^"]*)"/.exec(this.html)?.[1];
        if (bbox !== undefined) {
            node.bboxHeight = Number(bbox);
        }
        return node;
    }
}

function diagram(): FakeElement {
    return new FakeElement();
}

async function takeRender(): Promise<(typeof pendingRenders)[number]> {
    await vi.waitFor(() => {
        expect(pendingRenders.length).toBeGreaterThan(0);
    });
    const pending = pendingRenders.shift();
    if (!pending) {
        throw new Error("missing mermaid render");
    }
    return pending;
}

async function flushRender(): Promise<(value: { svg: string }) => void> {
    const pending = await takeRender();
    return pending.resolve;
}

async function rejectRender(): Promise<(reason?: unknown) => void> {
    const pending = await takeRender();
    return pending.reject;
}

describe("renderMermaidDiagram", () => {
    beforeAll(async () => {
        (globalThis as unknown as { SVGSVGElement?: typeof FakeSvg }).SVGSVGElement = FakeSvg;
        (globalThis as { document?: unknown }).document = {
            createElement: () => new FakeElement(),
            body: { append: () => undefined },
        };
        const { renderMermaidDiagram } = await import("./mermaid");
        const host = diagram();
        const pending = renderMermaidDiagram(host as unknown as HTMLElement, "graph TD;A-->B");
        const resolve = await flushRender();
        resolve({ svg: `<svg height="40" id="cached"></svg>` });
        await pending;
    });

    afterAll(() => {
        delete (globalThis as { SVGSVGElement?: unknown }).SVGSVGElement;
        delete (globalThis as { document?: unknown }).document;
    });

    it("paints a cached svg into a disconnected diagram", async () => {
        const { renderMermaidDiagram } = await import("./mermaid");
        const host = diagram();
        const height = await renderMermaidDiagram(host as unknown as HTMLElement, "graph TD;A-->B");
        expect(pendingRenders).toHaveLength(0);
        expect(host.innerHTML).toContain('id="cached"');
        expect(host.dataset.mermaidSource).toBe("graph TD;A-->B");
        expect(host.isConnected).toBe(false);
        expect(height).toBe(40);
    });

    it("inserts the svg on a cold render while the diagram is disconnected", async () => {
        const { renderMermaidDiagram } = await import("./mermaid");
        const host = diagram();
        const pending = renderMermaidDiagram(host as unknown as HTMLElement, "graph LR;X-->Y");
        const resolve = await flushRender();
        resolve({ svg: `<svg height="40" id="cold"></svg>` });
        const height = await pending;
        expect(host.innerHTML).toContain('id="cold"');
        expect(host.dataset.mermaidSource).toBe("graph LR;X-->Y");
        expect(height).toBe(40);
    });

    it("does not let a late render replace a newer painted source", async () => {
        const { renderMermaidDiagram } = await import("./mermaid");
        const host = diagram();
        const pending = renderMermaidDiagram(host as unknown as HTMLElement, "sequenceDiagram");
        host.dataset.mermaidSource = "flowchart";
        host.innerHTML = `<svg height="12" id="newer"></svg>`;
        const resolve = await flushRender();
        resolve({ svg: `<svg height="80" id="stale"></svg>` });
        await pending;
        expect(host.innerHTML).toContain('id="newer"');
        expect(host.innerHTML).not.toContain("stale");
        expect(host.dataset.mermaidSource).toBe("flowchart");
        const follow = diagram();
        const height = await renderMermaidDiagram(follow as unknown as HTMLElement, "sequenceDiagram");
        expect(follow.innerHTML).toContain('id="stale"');
        expect(height).toBe(80);
    });

    it("remeasures a cached diagram that is connected", async () => {
        const { renderMermaidDiagram } = await import("./mermaid");
        const host = diagram();
        host.isConnected = true;
        const height = await renderMermaidDiagram(host as unknown as HTMLElement, "graph TD;A-->B");
        expect(pendingRenders).toHaveLength(0);
        expect(host.innerHTML).toContain('id="cached"');
        expect(height).toBe(40);
    });

    it("skips mermaid when the diagram already shows that source", async () => {
        const { renderMermaidDiagram } = await import("./mermaid");
        const host = diagram();
        host.dataset.mermaidSource = "graph TD;A-->B";
        host.innerHTML = `<svg height="15" id="already"></svg>`;
        const height = await renderMermaidDiagram(host as unknown as HTMLElement, "graph TD;A-->B");
        expect(pendingRenders).toHaveLength(0);
        expect(host.innerHTML).toContain('id="already"');
        expect(height).toBe(15);
    });

    it("falls through to the cache when the source matches but the svg is gone", async () => {
        const { renderMermaidDiagram } = await import("./mermaid");
        const host = diagram();
        host.dataset.mermaidSource = "graph TD;A-->B";
        const height = await renderMermaidDiagram(host as unknown as HTMLElement, "graph TD;A-->B");
        expect(pendingRenders).toHaveLength(0);
        expect(host.innerHTML).toContain('id="cached"');
        expect(height).toBe(40);
    });

    it("paints a connected diagram and keeps that svg on the next call", async () => {
        const { renderMermaidDiagram } = await import("./mermaid");
        const host = diagram();
        host.isConnected = true;
        const pending = renderMermaidDiagram(host as unknown as HTMLElement, "graph TD;connected");
        const resolve = await flushRender();
        resolve({ svg: `<svg height="50" id="live"></svg>` });
        const height = await pending;
        expect(host.innerHTML).toContain('id="live"');
        expect(host.attributes["aria-busy"]).toBe("false");
        expect(height).toBe(50);
        const again = await renderMermaidDiagram(host as unknown as HTMLElement, "graph TD;connected");
        expect(pendingRenders).toHaveLength(0);
        expect(again).toBe(50);
    });

    it("measures the visible diagram when a stale render finishes while connected", async () => {
        const { renderMermaidDiagram } = await import("./mermaid");
        const host = diagram();
        host.isConnected = true;
        const pending = renderMermaidDiagram(host as unknown as HTMLElement, "graph TD;stale-connected");
        host.dataset.mermaidSource = "graph TD;A-->B";
        host.innerHTML = `<svg height="12" id="visible"></svg>`;
        const resolve = await flushRender();
        resolve({ svg: `<svg height="90" id="ignored"></svg>` });
        const height = await pending;
        expect(host.innerHTML).toContain('id="visible"');
        expect(height).toBe(12);
        const follow = diagram();
        const cached = await renderMermaidDiagram(follow as unknown as HTMLElement, "graph TD;stale-connected");
        expect(follow.innerHTML).toContain('id="ignored"');
        expect(cached).toBe(90);
    });

    it("measures the incoming svg when the painted source is cleared before lookup", async () => {
        const { renderMermaidDiagram } = await import("./mermaid");
        const host = diagram();
        const pending = renderMermaidDiagram(host as unknown as HTMLElement, "graph TD;source-dropped");
        let reads = 0;
        Object.defineProperty(host, "dataset", {
            configurable: true,
            get() {
                reads += 1;
                return reads === 1 ? { mermaidSource: "graph TD;A-->B" } : {};
            },
        });
        host.innerHTML = `<svg height="12" id="kept"></svg>`;
        const resolve = await flushRender();
        resolve({ svg: `<svg height="64" id="measured"></svg>` });
        const height = await pending;
        expect(host.innerHTML).toContain('id="kept"');
        expect(height).toBe(64);
    });

    it("returns the height of the source still on screen when a stale render is disconnected", async () => {
        const { renderMermaidDiagram } = await import("./mermaid");
        const host = diagram();
        const pending = renderMermaidDiagram(host as unknown as HTMLElement, "graph TD;stale-cached");
        host.dataset.mermaidSource = "graph TD;A-->B";
        host.innerHTML = `<svg height="12" id="kept"></svg>`;
        const resolve = await flushRender();
        resolve({ svg: `<svg height="200" id="unpainted"></svg>` });
        const height = await pending;
        expect(host.innerHTML).toContain('id="kept"');
        expect(height).toBe(40);
    });

    it("measures height from the viewBox, the bbox, and the scroll height", async () => {
        const { renderMermaidDiagram } = await import("./mermaid");
        const cases = [
            { source: "graph TD;no-svg", svg: `<div id="no-svg"></div>`, height: 120 },
            { source: "graph TD;zero-height", svg: `<svg height="0" id="zero"></svg>`, height: 10 },
            { source: "graph TD;bad-height", svg: `<svg height="auto" id="bad"></svg>`, height: 10 },
            { source: "graph TD;viewbox", svg: `<svg viewBox="0 0 20 80" id="view"></svg>`, height: 80 },
            { source: "graph TD;bbox", svg: `<svg data-bbox="30" id="bbox"></svg>`, height: 30 },
            { source: "graph TD;nan-bbox", svg: `<svg data-bbox="NaN" id="nan"></svg>`, height: 10 },
        ];
        for (const entry of cases) {
            const host = diagram();
            const pending = renderMermaidDiagram(host as unknown as HTMLElement, entry.source);
            const resolve = await flushRender();
            resolve({ svg: entry.svg });
            const height = await pending;
            expect(height).toBe(entry.height);
            expect(host.dataset.mermaidSource).toBe(entry.source);
        }
    });

    it("keeps the painted diagram when rendering fails", async () => {
        const { renderMermaidDiagram } = await import("./mermaid");
        const connected = diagram();
        connected.isConnected = true;
        const connectedRender = renderMermaidDiagram(connected as unknown as HTMLElement, "graph TD;error-keep");
        connected.dataset.mermaidSource = "graph TD;A-->B";
        connected.innerHTML = `<svg height="40" id="safe"></svg>`;
        (await rejectRender())(new Error("late"));
        const connectedHeight = await connectedRender;
        expect(connected.innerHTML).toContain('id="safe"');
        expect(connected.classes.has("inline-md-mermaid-error")).toBe(false);
        expect(connectedHeight).toBe(40);

        const detached = diagram();
        const detachedRender = renderMermaidDiagram(detached as unknown as HTMLElement, "graph TD;error-keep-off");
        detached.dataset.mermaidSource = "flowchart";
        detached.innerHTML = `<svg height="40" id="safe-off"></svg>`;
        (await rejectRender())(new Error("late"));
        expect(await detachedRender).toBe(0);
        expect(detached.innerHTML).toContain('id="safe-off"');
    });

    it("reports a failed render on a connected diagram and ignores a detached one", async () => {
        const { renderMermaidDiagram } = await import("./mermaid");
        const detached = diagram();
        const detachedRender = renderMermaidDiagram(detached as unknown as HTMLElement, "graph TD;error-off");
        (await rejectRender())(new Error("missing"));
        expect(await detachedRender).toBe(0);
        expect(detached.textContent).toBe("");

        const connected = diagram();
        connected.isConnected = true;
        const connectedRender = renderMermaidDiagram(connected as unknown as HTMLElement, "graph TD;error-on");
        (await rejectRender())(new Error("syntax"));
        expect(await connectedRender).toBe(80);
        expect(connected.classes.has("inline-md-mermaid-error")).toBe(true);
        expect(connected.textContent).toBe("Mermaid render failed: syntax");
        expect(connected.dataset.mermaidSource).toBe("graph TD;error-on");
        expect(connected.attributes["aria-busy"]).toBe("false");

        const other = diagram();
        other.isConnected = true;
        const otherRender = renderMermaidDiagram(other as unknown as HTMLElement, "graph TD;error-string");
        (await rejectRender())("boom");
        expect(await otherRender).toBe(80);
        expect(other.textContent).toBe("Mermaid render failed: boom");
    });
});

describe("isMermaidCodeBlock", () => {
    it("accepts only a mermaid language id", async () => {
        const { isMermaidCodeBlock } = await import("./mermaid");
        expect(isMermaidCodeBlock(undefined)).toBe(false);
        expect(isMermaidCodeBlock("")).toBe(false);
        expect(isMermaidCodeBlock("  Mermaid  ")).toBe(true);
        expect(isMermaidCodeBlock("graph")).toBe(false);
    });
});
