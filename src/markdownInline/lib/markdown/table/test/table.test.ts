import { afterEach, describe, expect, it, vi } from "vite-plus/test";
import type { CursorContext, Scope } from "../../../document/types";

vi.mock("monaco-editor/editor/editor.api", () => ({
    editor: {},
}));

import { tableShowsRaw } from "../raw";
import { tableSourceClass, tableZone } from "../style";

class TestNode {
    parentElement: TestElement | null = null;
    childNodes: TestNode[] = [];
}

class TestElement extends TestNode {
    readonly tag: string;
    className = "";
    textContent = "";
    dataset: Record<string, string | undefined> = {};

    constructor(tag: string) {
        super();
        this.tag = tag;
    }

    append(child: TestNode): void {
        child.parentElement = this;
        this.childNodes.push(child);
    }

    addEventListener(): void {}

    matches(selector: string): boolean {
        if (selector === "td, th") {
            return this.tag === "td" || this.tag === "th";
        }
        if (selector.startsWith(".")) {
            return this.className.split(/\s+/).includes(selector.slice(1));
        }
        return this.tag === selector;
    }

    closest(selector: string): TestElement | null {
        if (this.matches(selector)) {
            return this;
        }
        return this.parentElement?.closest(selector) ?? null;
    }

    find(selector: string): TestElement | undefined {
        if (this.matches(selector)) {
            return this;
        }
        for (const child of this.childNodes) {
            if (child instanceof TestElement) {
                const nested = child.find(selector);
                if (nested) {
                    return nested;
                }
            }
        }
        return undefined;
    }
}

function installDom(): void {
    vi.stubGlobal("Node", TestNode as unknown as typeof Node);
    vi.stubGlobal("Element", TestElement as unknown as typeof Element);
    vi.stubGlobal("HTMLElement", TestElement as unknown as typeof HTMLElement);
    vi.stubGlobal("document", {
        createElement: (tag: string) => new TestElement(tag),
    } as unknown as Document);
}

function element(node: unknown): TestElement {
    return node as unknown as TestElement;
}

function textOf(node: TestElement): string {
    if (node.childNodes.length === 0) {
        return node.textContent;
    }
    return node.childNodes
        .filter((child): child is TestElement => child instanceof TestElement)
        .map((child) => textOf(child))
        .join("");
}

function scope(overrides: Partial<Scope> & Pick<Scope, "kind">): Scope {
    return {
        start: 0,
        end: 0,
        contentStart: 0,
        contentEnd: 0,
        markers: [],
        ...overrides,
    };
}

function cursor(
    head: number,
    lineStart: number,
    lineEnd: number,
    anchor = head,
    eolLength = 1,
): CursorContext {
    return { selectionFrom: anchor, selectionTo: head, lineStart, lineEnd, eolLength };
}

afterEach(() => {
    vi.unstubAllGlobals();
});

describe("tableShowsRaw", () => {
    const table = scope({
        kind: "table",
        start: 30,
        end: 70,
        contentStart: 32,
        contentEnd: 36,
        markers: [{ start: 30, end: 70 }],
        rows: [[{ start: 32, end: 36 }]],
    });

    it("shows the pipe source while the caret is inside the table", () => {
        expect(tableShowsRaw(table, cursor(30, 30, 70))).toBe(true);
        expect(tableShowsRaw(table, cursor(40, 30, 70))).toBe(true);
        expect(tableShowsRaw(table, cursor(69, 60, 80))).toBe(true);
    });

    it("shows the pipe source when the caret line overlaps the table", () => {
        expect(tableShowsRaw(table, cursor(80, 60, 90))).toBe(true);
    });

    it("shows the pipe source when the caret sits one line break before the table", () => {
        expect(tableShowsRaw(table, cursor(10, 0, 29))).toBe(true);
        expect(tableShowsRaw(table, cursor(10, 0, 28, 10, 2))).toBe(true);
    });

    it("shows the pipe source when a selection overlaps the table", () => {
        expect(tableShowsRaw(table, cursor(90, 80, 100, 0))).toBe(true);
    });

    it("shows the pipe grid when the caret is outside the table", () => {
        expect(tableShowsRaw(table, cursor(70, 70, 80))).toBe(false);
        expect(tableShowsRaw(table, cursor(10, 0, 28))).toBe(false);
        expect(tableShowsRaw(table, cursor(10, 0, 27))).toBe(false);
        expect(tableShowsRaw(table, cursor(90, 80, 100))).toBe(false);
        expect(tableShowsRaw(table, cursor(5, 0, 10, 0))).toBe(false);
    });
});

describe("tableZone", () => {
    it("builds a header cell and a body cell", () => {
        installDom();
        const source = "NameGo";
        const record = tableZone(
            scope({
                kind: "table",
                start: 0,
                end: source.length,
                rows: [[{ start: 0, end: 4 }], [{ start: 4, end: 6 }]],
            }),
            source,
            [],
            0,
            { onReveal: vi.fn() },
        );
        const frame = element(record.domNode);
        expect(frame.className).toBe("inline-md-table");
        expect(tableSourceClass).toBe("inline-md-table-source");
        const header = frame.find("th");
        expect(header).toBeDefined();
        expect(textOf(header!)).toBe("Name");
        const body = element(frame.find("tbody")?.childNodes[1]);
        const cell = element(body.childNodes[0]);
        expect(cell.tag).toBe("td");
        expect(textOf(cell)).toBe("Go");
    });
});
