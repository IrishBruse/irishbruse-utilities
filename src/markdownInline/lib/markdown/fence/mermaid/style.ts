import type * as monaco from "monaco-editor/editor/editor.api";
import type { BlockZoneHost, BlockZoneRecord } from "../../../preview/blockZone";
import { renderMermaidDiagram } from "../../../preview/mermaid";
import type { Scope } from "../../../document/types";

function lineNumberNode(lineNumber: number): HTMLDivElement {
    const number = document.createElement("div");
    number.className = "inline-md-zone-number";
    number.textContent = String(lineNumber);
    return number;
}

export function createMermaidZone(
    scope: Scope,
    content: string,
    key: string,
    lineNumber: number,
    host: BlockZoneHost,
): BlockZoneRecord {
    const openLine = lineNumber - 1;
    const frame = document.createElement("div");
    frame.className = "inline-md-mermaid";
    const openPreview = document.createElement("button");
    openPreview.type = "button";
    openPreview.className = "inline-md-mermaid-open-preview";
    openPreview.textContent = "Open Preview";
    openPreview.title = "Open Mermaid preview";
    openPreview.addEventListener("mousedown", (event) => {
        event.preventDefault();
        event.stopPropagation();
        host.onOpenMermaidPreview?.(openLine);
    });
    frame.addEventListener("mousedown", (event) => {
        if (
            event.target instanceof HTMLElement &&
            event.target.closest(".inline-md-mermaid-open-preview")
        ) {
            return;
        }
        event.preventDefault();
        event.stopPropagation();
        host.onReveal(scope.contentStart + 1);
    });
    const diagram = document.createElement("div");
    diagram.className = "inline-md-mermaid-diagram";
    frame.append(openPreview);
    frame.append(diagram);
    const zone: monaco.editor.IViewZone = {
        afterLineNumber: lineNumber - 1,
        heightInPx: 120,
        domNode: frame,
        marginDomNode: lineNumberNode(lineNumber),
        suppressMouseDown: true,
        showInHiddenAreas: true,
    };
    const fitZoneHeight = (): void => {
        if (!frame.isConnected) {
            return;
        }
        const measured = Math.ceil(frame.scrollHeight);
        if (measured > 0 && Math.abs(measured - (zone.heightInPx ?? 0)) > 1) {
            zone.heightInPx = measured;
            host.onLayout(key);
        }
    };
    void renderMermaidDiagram(diagram, content).then((height) => {
        if (!frame.isConnected || height <= 0) {
            return;
        }
        zone.heightInPx = height;
        requestAnimationFrame(fitZoneHeight);
    });
    return { key, zone };
}
