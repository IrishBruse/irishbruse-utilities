import { describe, expect, it } from "vitest";
import { computeToolCallDiffRows } from "./toolCallDiffLines";

describe("computeToolCallDiffRows", () => {
    it("emits removed and added for a single-line change", () => {
        expect(computeToolCallDiffRows("a\n", "b\n")).toEqual([
            { kind: "removed", text: "a" },
            { kind: "added", text: "b" },
        ]);
    });

    it("preserves a shared context line", () => {
        expect(computeToolCallDiffRows("x\na\n", "x\nb\n")).toEqual([
            { kind: "context", text: "x" },
            { kind: "removed", text: "a" },
            { kind: "added", text: "b" },
        ]);
    });
});
