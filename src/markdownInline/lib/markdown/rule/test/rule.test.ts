import { describe, expect, it } from "vite-plus/test";
import type { CursorContext, TextRange } from "../../../document/types";
import { ruleShowsRaw } from "../raw";
import { createRuleZoneBody } from "../style";

function cursor(head: number, lineStart: number, lineEnd: number, anchor = head): CursorContext {
    return { selectionFrom: anchor, selectionTo: head, lineStart, lineEnd, eolLength: 1 };
}

const rule: TextRange = { start: 10, end: 14 };

class FakeElement {
    tagName: string;
    className = "";
    children: FakeElement[] = [];
    listener: ((event: MouseEvent) => void) | undefined;

    constructor(tag: string) {
        this.tagName = tag.toUpperCase();
    }

    append(child: FakeElement): void {
        this.children.push(child);
    }

    addEventListener(_type: string, listener: (event: MouseEvent) => void): void {
        this.listener = listener;
    }

    querySelector(selector: string): FakeElement | null {
        return this.children.find((child) => child.tagName.toLowerCase() === selector) ?? null;
    }
}

describe("ruleShowsRaw", () => {
    it("shows the dashes when the selection overlaps the rule", () => {
        expect(ruleShowsRaw(rule, cursor(20, 16, 30, 0))).toBe(true);
    });

    it("shows the dashes when the caret is on the rule line", () => {
        expect(ruleShowsRaw(rule, cursor(8, 0, 20))).toBe(true);
        expect(ruleShowsRaw(rule, cursor(12, 0, 20))).toBe(true);
    });

    it("hides the dashes when the caret is on another line", () => {
        expect(ruleShowsRaw(rule, cursor(40, 30, 50))).toBe(false);
    });
});

describe("createRuleZoneBody", () => {
    it("builds a zone whose line is an hr", () => {
        const previous = globalThis.document;
        viStubDocument();
        const frame = createRuleZoneBody(8, () => undefined);
        const line = frame.querySelector("hr");
        expect(line).not.toBeNull();
        expect(line?.tagName).toBe("HR");
        expect(line?.className).toBe("inline-md-hr");
        globalThis.document = previous;
    });
});

function viStubDocument(): void {
    Object.defineProperty(globalThis, "document", {
        configurable: true,
        writable: true,
        value: {
            createElement(tag: string): FakeElement {
                return new FakeElement(tag);
            },
        },
    });
}
