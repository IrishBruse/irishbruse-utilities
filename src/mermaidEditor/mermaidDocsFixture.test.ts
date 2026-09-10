import { describe, expect, it } from "vitest";
import { mermaidDocsFixturePath } from "./mermaidDocsFixture";

describe("mermaidEditor/mermaidDocsFixture", () => {
    it("resolves docs/tests/mermaid fixture paths from the repo root", () => {
        expect(mermaidDocsFixturePath("call_graph.mmd")).toMatch(/docs\/tests\/mermaid\/call_graph\.mmd$/);
    });
});
