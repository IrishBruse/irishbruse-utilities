import { normalizeGblClickPair } from "./mermaidClickTarget";

/** GBL call-graph style: `click NodeId href "href" "tooltip"` */
const GBL_CLICK_HREF_LINE =
    /^\s*click\s+(\S+)\s+href\s+"([^"]*)"\s+"([^"]*)"\s*$/;

export interface MermaidClickHrefLine {
    nodeId: string;
    href: string;
    tooltip: string;
}

export function parseMermaidClickHrefLines(source: string): MermaidClickHrefLine[] {
    const lines: MermaidClickHrefLine[] = [];
    for (const line of source.split(/\r?\n/)) {
        const normalizedLine = line.trim().replace(/[\u201C\u201D]/g, '"');
        const match = GBL_CLICK_HREF_LINE.exec(normalizedLine);
        if (!match) {
            continue;
        }
        lines.push({
            nodeId: match[1],
            href: match[2],
            tooltip: match[3],
        });
    }
    return lines;
}

export function getClickTargetFromMap(
    map: Map<string, { href: string; tooltip: string }>,
    nodeId: string
): { href: string; tooltip: string } | undefined {
    const direct = map.get(nodeId);
    if (direct) {
        return direct;
    }
    const lower = nodeId.toLowerCase();
    for (const [key, value] of map) {
        if (key.toLowerCase() === lower) {
            return value;
        }
    }
    return undefined;
}

export function buildMermaidClickTargetMap(source: string): Map<string, { href: string; tooltip: string }> {
    const map = new Map<string, { href: string; tooltip: string }>();
    for (const { nodeId, href, tooltip } of parseMermaidClickHrefLines(source)) {
        map.set(nodeId, normalizeGblClickPair(href, tooltip));
    }
    return map;
}

/** Mermaid flowchart DOM id → logical node id (e.g. flowchart-Other-3 → Other). */
export function resolveFlowchartNodeIdFromDomId(domId: string): string {
    const trimmed = domId.trim();
    if (!trimmed) {
        return "";
    }
    // Mermaid 11+ prefixes diagram ids (e.g. my-svg-flowchart-Other-3, mermaid-1-flowchart-Other-3).
    const flowchartMatch = /flowchart-(.+)-\d+$/i.exec(trimmed);
    if (flowchartMatch) {
        return flowchartMatch[1];
    }
    return trimmed;
}
