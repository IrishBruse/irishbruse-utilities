import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

const pendingRenders: Array<(value: { svg: string }) => void> = [];

vi.mock("mermaid", () => ({
    default: {
        initialize: () => undefined,
        render: () =>
            new Promise<{ svg: string }>((resolve) => {
                pendingRenders.push(resolve);
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
    getAttribute(name: string): string | null {
        return name === "height" ? this.heightAttr : null;
    }
    getBBox(): { height: number } {
        return { height: 0 };
    }
}

class FakeElement {
    isConnected = false;
    dataset: Record<string, string> = {};
    style = { cssText: "" };
    textContent = "";
    private html = "";
    classList = {
        add: () => undefined,
        remove: () => undefined,
    };
    setAttribute(): void {}
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
        node.heightAttr = /height="([^"]+)"/.exec(this.html)?.[1] ?? null;
        return node;
    }
}

function diagram(): FakeElement {
    return new FakeElement();
}

async function flushRender(): Promise<(value: { svg: string }) => void> {
    await vi.waitFor(() => {
        expect(pendingRenders.length).toBeGreaterThan(0);
    });
    const resolve = pendingRenders.shift();
    if (!resolve) {
        throw new Error("missing mermaid render");
    }
    return resolve;
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
        expect(height).toBe(68);
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
        expect(height).toBe(68);
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
        expect(height).toBe(108);
    });
});
