import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { mermaidDocsFixturePath } from "./mermaidDocsFixture";
import {
    buildMermaidClickTargetMap,
    getClickTargetFromMap,
    parseMermaidClickHrefLines,
    resolveFlowchartNodeIdFromDomId,
} from "./parseMermaidClickLines";

describe("mermaidEditor/parseMermaidClickLines", () => {
    it("extracts GBL-style click href lines from a call graph fixture", () => {
        const source = readFileSync(mermaidDocsFixturePath("call_graph.mmd"), "utf8");
        const clicks = parseMermaidClickHrefLines(source);

        expect(clicks).toHaveLength(4);
        expect(clicks.map((c) => c.nodeId)).toEqual(["Helper", "Main", "Nested", "Other"]);
        expect(clicks[3]).toEqual({
            nodeId: "Other",
            href: "test.txt:3:2",
            tooltip: "test.txt:3:2",
        });
    });

    it("ignores non-click lines and partial matches", () => {
        const source = `
flowchart TD
    A --> B
    click A href "../a.gbl#L1" "../a.gbl:1:1"
    click broken line
    click B "only legacy url"
`;
        expect(parseMermaidClickHrefLines(source)).toEqual([
            { nodeId: "A", href: "../a.gbl#L1", tooltip: "../a.gbl:1:1" },
        ]);
    });

    it("builds a node id map with GBL path:line:column hrefs", () => {
        const map = buildMermaidClickTargetMap('click X href "a.mmd" "a.mmd:1:1"');
        expect(map.get("X")).toEqual({ href: "a.mmd", tooltip: "a.mmd:1:1" });
    });

    it("normalizes legacy #L hrefs from tooltip when building the map", () => {
        const map = buildMermaidClickTargetMap('click A href "../a.gbl#L9" "../a.gbl:9:2"');
        expect(map.get("A")).toEqual({ href: "../a.gbl", tooltip: "../a.gbl:9:2" });
    });

    it("resolves click targets case-insensitively by node id", () => {
        const map = buildMermaidClickTargetMap('click Other href "test.txt:3:2" "test.txt:3:2"');
        expect(getClickTargetFromMap(map, "other")).toEqual({
            href: "test.txt",
            tooltip: "test.txt:3:2",
        });
    });

    it("resolves mermaid flowchart dom ids to node ids", () => {
        expect(resolveFlowchartNodeIdFromDomId("flowchart-Other-12")).toBe("Other");
        expect(resolveFlowchartNodeIdFromDomId("flowchart-Main__if0-3")).toBe("Main__if0");
        expect(resolveFlowchartNodeIdFromDomId("my-svg-flowchart-Other-3")).toBe("Other");
        expect(resolveFlowchartNodeIdFromDomId("mermaid-42-flowchart-Other-3")).toBe("Other");
    });
});
