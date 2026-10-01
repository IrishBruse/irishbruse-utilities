import { describe, expect, it } from "vitest";
import { lineModelFromSource, listItemGapAfterLines, listItemStartLines } from "./listItemGap";
import { parseScopes } from "./scopes";

function gaps(source: string): number[] {
    const model = lineModelFromSource(source);
    const starts = listItemStartLines(model, parseScopes(source), 4);
    return listItemGapAfterLines(model, starts, 4);
}

describe("listItemGapAfterLines", () => {
    it("adds a gap after the first of two single-line bullets", () => {
        expect(gaps("- a\n- b\n")).toEqual([1, 2]);
    });

    it("ends a multi-line item after the continuation line", () => {
        expect(gaps("- a\n  cont\n- b\n")).toEqual([2, 3]);
    });

    it("uses one gap after nested items before the next sibling", () => {
        expect(gaps("- parent\n  - child\n- next\n")).toEqual([2, 3]);
    });

    it("includes task and ordered list lines", () => {
        expect(gaps("- [ ] task\n1. ordered\n")).toEqual([1, 2]);
    });

    it("skips gaps for plain paragraphs", () => {
        expect(gaps("para one\npara two\n")).toEqual([]);
    });
});
