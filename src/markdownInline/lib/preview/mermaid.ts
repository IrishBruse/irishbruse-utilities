import {
    applyWorkbenchMermaidTokens,
    getWorkbenchMermaidInit,
} from "../../../lib/mermaid/vsCodeTheme.browser";

let mermaidPromise: Promise<(typeof import("mermaid"))["default"]> | undefined;
let configured = false;
let renderCounter = 0;

const renderedBySource = new Map<string, { svg: string; height: number }>();

function loadMermaid(): Promise<(typeof import("mermaid"))["default"]> {
    if (!mermaidPromise) {
        mermaidPromise = import("mermaid").then((module) => module.default);
    }
    return mermaidPromise;
}

function configureMermaid(mermaid: (typeof import("mermaid"))["default"]): void {
    if (configured) {
        return;
    }
    const theme = getWorkbenchMermaidInit();
    mermaid.initialize({
        startOnLoad: false,
        theme: "base",
        themeVariables: theme.themeVariables,
        themeCSS: theme.themeCSS,
    });
    configured = true;
}

function measureDiagramHeight(diagram: HTMLElement): number {
    const svgNode = diagram.querySelector("svg");
    if (!(svgNode instanceof SVGSVGElement)) {
        return 120;
    }
    const heightAttr = svgNode.getAttribute("height");
    if (heightAttr) {
        const parsed = Number.parseFloat(heightAttr);
        if (Number.isFinite(parsed) && parsed > 0) {
            return Math.ceil(parsed);
        }
    }
    const viewBox = svgNode.viewBox.baseVal;
    if (viewBox.height > 0) {
        return Math.ceil(viewBox.height);
    }
    const box = svgNode.getBBox();
    const height = Number.isFinite(box.height) && box.height > 0 ? Math.ceil(box.height) : diagram.scrollHeight;
    return Math.ceil(height);
}

function writeDiagramSvg(diagram: HTMLElement, source: string, svg: string): void {
    diagram.dataset.mermaidSource = source;
    diagram.classList.remove("inline-md-mermaid-error");
    diagram.innerHTML = svg;
    applyWorkbenchMermaidTokens(diagram);
    diagram.setAttribute("aria-busy", "false");
}

function paintDiagram(diagram: HTMLElement, source: string, svg: string): number {
    writeDiagramSvg(diagram, source, svg);
    return measureDiagramHeight(diagram);
}

function keepPaintedSource(diagram: HTMLElement, source: string): boolean {
    const painted = diagram.dataset.mermaidSource;
    return painted !== undefined && painted !== source && diagram.querySelector("svg") !== null;
}

export function isMermaidCodeBlock(language: string | undefined): boolean {
    return (language ?? "").trim().toLowerCase() === "mermaid";
}

export async function renderMermaidDiagram(diagram: HTMLElement, source: string): Promise<number> {
    if (diagram.dataset.mermaidSource === source && diagram.querySelector("svg")) {
        return measureDiagramHeight(diagram);
    }
    const cached = renderedBySource.get(source);
    if (cached) {
        writeDiagramSvg(diagram, source, cached.svg);
        if (!diagram.isConnected) {
            return cached.height;
        }
        return measureDiagramHeight(diagram);
    }
    diagram.setAttribute("aria-busy", "true");
    diagram.classList.remove("inline-md-mermaid-error");
    diagram.replaceChildren();
    const id = `inline-mermaid-${renderCounter++}`;
    try {
        const mermaid = await loadMermaid();
        configureMermaid(mermaid);
        const { svg } = await mermaid.render(id, source);
        if (keepPaintedSource(diagram, source)) {
            const height = measureDiagramHeightFromSvg(svg);
            renderedBySource.set(source, { svg, height });
            if (diagram.isConnected) {
                return measureDiagramHeight(diagram);
            }
            const shown = renderedBySource.get(diagram.dataset.mermaidSource ?? "");
            return shown?.height ?? height;
        }
        if (!diagram.isConnected) {
            const height = measureDiagramHeightFromSvg(svg);
            renderedBySource.set(source, { svg, height });
            writeDiagramSvg(diagram, source, svg);
            return height;
        }
        const height = paintDiagram(diagram, source, svg);
        renderedBySource.set(source, { svg, height });
        return height;
    } catch (error) {
        if (keepPaintedSource(diagram, source)) {
            return diagram.isConnected ? measureDiagramHeight(diagram) : 0;
        }
        if (!diagram.isConnected) {
            return 0;
        }
        const message = error instanceof Error ? error.message : String(error);
        diagram.dataset.mermaidSource = source;
        diagram.classList.add("inline-md-mermaid-error");
        diagram.textContent = `Mermaid render failed: ${message}`;
        diagram.setAttribute("aria-busy", "false");
        return 80;
    }
}

function measureDiagramHeightFromSvg(svg: string): number {
    const probe = document.createElement("div");
    probe.style.cssText = "position:fixed;left:-10000px;top:0;visibility:hidden;pointer-events:none";
    probe.innerHTML = svg;
    document.body.append(probe);
    const height = measureDiagramHeight(probe);
    probe.remove();
    return height;
}
