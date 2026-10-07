import { describe, expect, it, vi } from "vitest";

vi.mock("./mermaid", () => ({
    renderMermaidDiagram: vi.fn(),
}));

import type { Scope } from "../document/types";
import { previewContentClass, previewContentRange } from "./paint";

describe("previewContentRange", () => {
    it("covers formatted content only", () => {
        const scope: Scope = {
            kind: "strong",
            start: 0,
            end: 9,
            contentStart: 2,
            contentEnd: 7,
            markers: [{ start: 0, end: 2 }, { start: 7, end: 9 }],
        };
        expect(previewContentRange(scope)).toEqual({ start: 2, end: 7 });
    });
});

describe("previewContentClass", () => {
    it("chooses the formatted content class", () => {
        const heading: Scope = {
            kind: "heading",
            start: 0,
            end: 8,
            contentStart: 2,
            contentEnd: 7,
            markers: [{ start: 0, end: 2 }],
            level: 2,
        };
        const table: Scope = {
            kind: "table",
            start: 0,
            end: 10,
            contentStart: 0,
            contentEnd: 10,
            markers: [],
        };
        expect(previewContentClass(heading)).toBe("inline-md-h2");
        expect(previewContentClass(table)).toBeUndefined();
    });
});
