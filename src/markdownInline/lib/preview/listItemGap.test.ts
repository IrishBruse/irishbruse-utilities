import { describe, expect, it } from "vitest";
import type { Scope } from "../document/types";
import { parseScopes } from "../document/scopes";
import {
    applyListLineHeight,
    lineModelFromSource,
    listGapPaints,
    listItemGapAfterLines,
    listItemStartLines,
    listLineHeightPx,
    monacoLineModel,
} from "./listItemGap";

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

    it("skips an ordered marker inside a fenced code block", () => {
        expect(gaps("```markdown\n1. steps\nplain\n```\n")).toEqual([]);
    });

    it("skips gaps for plain paragraphs", () => {
        expect(gaps("para one\npara two\n")).toEqual([]);
    });

    it("paints the gap class and height from the list module", () => {
        const model = lineModelFromSource("- a\n- b\n");
        expect(listGapPaints(model, parseScopes("- a\n- b\n"), 4)).toEqual([
            { lineNumber: 1, className: "inline-md-list-gap-after", heightPx: 4, zoneKey: "list-gap:1:4" },
            { lineNumber: 2, className: "inline-md-list-gap-after", heightPx: 4, zoneKey: "list-gap:2:4" },
        ]);
        expect(listLineHeightPx(20)).toBe(24);
    });

    it("ends an item before a dedented line", () => {
        expect(gaps("- item\ntext\n")).toEqual([1]);
    });

    it("keeps a tab-indented continuation through the last line", () => {
        expect(gaps("- item\n\tmore")).toEqual([2]);
    });

    it("counts a tab before an ordered marker", () => {
        const source = "\t1. item";
        const model = lineModelFromSource(source);
        expect(listItemStartLines(model, parseScopes(source), 4)).toEqual([
            { lineNumber: 1, indentColumns: 4, contentIndentColumns: 5 },
        ]);
        expect(listItemGapAfterLines(model, listItemStartLines(model, parseScopes(source), 4), 4)).toEqual([1]);
    });

    it("ignores a task scope that has no marker", () => {
        const bareTask: Scope = {
            kind: "task",
            start: 0,
            end: 0,
            contentStart: 0,
            contentEnd: 0,
            markers: [],
        };
        const model = lineModelFromSource("plain\n");
        expect(listItemStartLines(model, [bareTask], 4)).toEqual([]);
    });

    it("uses a zero prefix when an ordered line stops matching", () => {
        let reads = 0;
        const line = {
            length: 1,
            [Symbol.toPrimitive]() {
                reads += 1;
                return reads === 1 ? "1. item" : "x";
            },
            slice(start: number, end?: number) {
                return "x".slice(start, end);
            },
            [Symbol.iterator]() {
                return "x"[Symbol.iterator]();
            },
        };
        const model = lineModelFromSource({
            split: () => [line],
            length: 1,
        } as unknown as string);
        expect(listItemStartLines(model, [], 4)).toEqual([
            { lineNumber: 1, indentColumns: 0, contentIndentColumns: 0 },
        ]);
    });

    it("ignores a list marker scope that has no marker", () => {
        const bareMarker: Scope = {
            kind: "listMarker",
            start: 0,
            end: 0,
            contentStart: 0,
            contentEnd: 0,
            markers: [],
        };
        const model = lineModelFromSource("1) item\n");
        expect(listItemStartLines(model, [bareMarker], 4)).toEqual([
            { lineNumber: 1, indentColumns: 0, contentIndentColumns: 1 },
        ]);
    });
});

describe("lineModelFromSource", () => {
    it("maps columns and offsets, including positions past the buffer", () => {
        const model = lineModelFromSource("ab\nc");
        expect(model.getLineCount()).toBe(2);
        expect(model.getLineContent(1)).toBe("ab");
        expect(model.getLineContent(9)).toBe("");
        expect(model.offsetAt(1, 2)).toBe(1);
        expect(model.offsetAt(2, 1)).toBe(3);
        expect(model.offsetAt(0, 1)).toBe(0);
        expect(model.offsetAt(9, 0)).toBe(0);
        expect(model.positionAt(0)).toEqual({ lineNumber: 1, column: 1 });
        expect(model.positionAt(4)).toEqual({ lineNumber: 2, column: 2 });
        expect(model.positionAt(99)).toEqual({ lineNumber: 2, column: 97 });
    });

    it("places an offset past an empty line list on column one of line zero", () => {
        const model = lineModelFromSource({ split: () => [], length: 0 } as unknown as string);
        expect(model.getLineCount()).toBe(0);
        expect(model.positionAt(5)).toEqual({ lineNumber: 0, column: 6 });
    });

    it("falls back when a later line has no offset entry", () => {
        let lineCount = 1;
        let lengthReads = 0;
        const lines = new Proxy(["ab"], {
            get(target, prop, receiver) {
                if (prop === "length") {
                    return lineCount;
                }
                return Reflect.get(target, prop, receiver);
            },
        });
        const source = {
            split: () => lines,
            get length() {
                lengthReads += 1;
                return lengthReads < 2 ? 0 : 50;
            },
        };
        const model = lineModelFromSource(source as unknown as string);
        lineCount = 3;
        expect(model.positionAt(10)).toEqual({ lineNumber: 3, column: 11 });
    });
});

describe("applyListLineHeight", () => {
    it("writes the list line height custom property", () => {
        let name = "";
        let value = "";
        const root = {
            style: {
                setProperty(property: string, propertyValue: string) {
                    name = property;
                    value = propertyValue;
                },
            },
        } as unknown as HTMLElement;
        applyListLineHeight(root, 18);
        expect(name).toBe("--ib-md-list-line");
        expect(value).toBe("22px");
    });
});

describe("monacoLineModel", () => {
    it("forwards line, offset, and position calls", () => {
        const wrapped = monacoLineModel({
            getLineCount: () => 2,
            getLineContent: (lineNumber) => (lineNumber === 1 ? "- a" : "- b"),
            getOffsetAt: (position) => position.lineNumber * 10 + position.column,
            getPositionAt: (offset) => ({ lineNumber: 1, column: offset + 1 }),
        });
        expect(wrapped.getLineCount()).toBe(2);
        expect(wrapped.getLineContent(2)).toBe("- b");
        expect(wrapped.offsetAt(1, 3)).toBe(13);
        expect(wrapped.positionAt(4)).toEqual({ lineNumber: 1, column: 5 });
    });
});
