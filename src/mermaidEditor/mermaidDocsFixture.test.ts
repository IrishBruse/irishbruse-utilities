import { describe, expect, it } from "vitest";
import { mermaidDocsFixturePath } from "./mermaidDocsFixture";

describe("mermaidEditor/mermaidDocsFixture", () => {
    it("resolves docs/mermaid fixture paths from the repo root", () => {
        expect(mermaidDocsFixturePath("call_graph.mmd")).toMatch(/docs\/mermaid\/call_graph\.mmd$/);
    });
});
