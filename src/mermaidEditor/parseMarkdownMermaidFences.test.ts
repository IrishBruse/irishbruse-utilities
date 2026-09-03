import { describe, expect, it } from "vitest";
import {
    findMarkdownMermaidFenceAtOpenLine,
    findMarkdownMermaidFenceContainingLine,
    parseMarkdownMermaidFences,
} from "./parseMarkdownMermaidFences";

describe("mermaidEditor/parseMarkdownMermaidFences", () => {
    it("parses a basic mermaid fence", () => {
        const text = `# Title

\`\`\`mermaid
graph TD
  A --> B
\`\`\`
`;
        const fences = parseMarkdownMermaidFences(text);
        expect(fences).toHaveLength(1);
        expect(fences[0]?.source).toBe("graph TD\n  A --> B");
        expect(fences[0]?.openLine).toBe(2);
        expect(fences[0]?.closeLine).toBe(5);
    });

    it("is case-insensitive on the language tag", () => {
        const text = "```MERMAID\nflowchart LR\n  x --> y\n```\n";
        const fences = parseMarkdownMermaidFences(text);
        expect(fences).toHaveLength(1);
        expect(fences[0]?.source).toContain("flowchart LR");
    });

    it("ignores unclosed fences", () => {
        const text = "```mermaid\ngraph TD\n  A --> B\n";
        expect(parseMarkdownMermaidFences(text)).toHaveLength(0);
    });

    it("finds a fence by opening line", () => {
        const text = "```mermaid\na\n```\n\n```mermaid\nb\n```\n";
        const fences = parseMarkdownMermaidFences(text);
        expect(fences).toHaveLength(2);
        const fence = findMarkdownMermaidFenceAtOpenLine(text, fences[1]!.openLine);
        expect(fence?.source).toBe("b");
    });

    it("finds a fence from a line inside the block", () => {
        const text = "```mermaid\ngraph TD\n  A --> B\n```\n";
        expect(findMarkdownMermaidFenceContainingLine(text, 1)?.source).toContain("graph TD");
        expect(findMarkdownMermaidFenceContainingLine(text, 3)?.source).toContain("graph TD");
        expect(findMarkdownMermaidFenceContainingLine(text, 4)).toBeUndefined();
    });
});
