import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("./mermaid", () => ({
    renderMermaidDiagram: vi.fn(),
}));

import { tableCellOffset } from "./blockZone";

class FakeElement {
    dataset: Record<string, string | undefined> = {};
    parentElement: FakeElement | null = null;
    private readonly kids: FakeElement[] = [];

    append(child: FakeElement): void {
        child.parentElement = this;
        this.kids.push(child);
    }

    contains(node: unknown): boolean {
        if (node === this) {
            return true;
        }
        return this.kids.some((kid) => kid === node || kid.contains(node));
    }

    closest(selector: string): FakeElement | null {
        if (selector === "[data-from]" && this.dataset.from !== undefined) {
            return this;
        }
        return this.parentElement?.closest(selector) ?? null;
    }
}

const priorDocument = globalThis.document;
const priorElement = globalThis.Element;
const priorHtmlElement = globalThis.HTMLElement;

function installDom(caret: { offsetNode: FakeElement; offset: number } | null): void {
    const ElementCtor = FakeElement as unknown as typeof Element;
    globalThis.Element = ElementCtor;
    globalThis.HTMLElement = ElementCtor as unknown as typeof HTMLElement;
    globalThis.document = {
        caretPositionFromPoint: () => caret,
        caretRangeFromPoint: () => null,
    } as unknown as Document;
}

afterEach(() => {
    globalThis.document = priorDocument;
    globalThis.Element = priorElement;
    globalThis.HTMLElement = priorHtmlElement;
});

describe("tableCellOffset", () => {
    it("uses data-start when the caret lookup misses", () => {
        installDom(null);
        const cell = new FakeElement();
        cell.dataset.start = "15";
        cell.dataset.end = "20";
        expect(tableCellOffset({ clientX: 0, clientY: 0 } as MouseEvent, cell as unknown as HTMLElement, 99)).toBe(15);
    });

    it("uses the fallback when data-start is missing", () => {
        installDom(null);
        const cell = new FakeElement();
        expect(tableCellOffset({ clientX: 0, clientY: 0 } as MouseEvent, cell as unknown as HTMLElement, 40)).toBe(40);
    });

    it("uses the source offset of a caret node inside the cell", () => {
        const cell = new FakeElement();
        cell.dataset.start = "10";
        cell.dataset.end = "20";
        const text = new FakeElement();
        text.dataset.from = "12";
        cell.append(text);
        installDom({ offsetNode: text, offset: 2 });
        expect(tableCellOffset({ clientX: 1, clientY: 1 } as MouseEvent, cell as unknown as HTMLElement, 10)).toBe(14);
    });
});
