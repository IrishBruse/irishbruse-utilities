import { describe, expect, it } from "vitest";
import { mermaidDiagramSource } from "./mermaidDiagramSource";

describe("mermaidDiagramSource", () => {
    it("drops a wrapping newline and a closing fence", () => {
        expect(mermaidDiagramSource("\nflowchart LR\n    A --> B\n")).toBe("flowchart LR\n    A --> B");
        expect(mermaidDiagramSource("\n```")).toBe("");
    });
});
