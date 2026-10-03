import { afterEach, describe, expect, it, vi } from "vitest";
import type { Scope } from "../document/types";

vi.mock("./mermaid", () => ({
    renderMermaidDiagram: vi.fn(),
}));

import { renderMermaidDiagram } from "./mermaid";
import {
    blockZone,
    contentClass,
    createMermaidZone,
    headingLevel,
    imageZoneKey,
    tableCellOffset,
    tableRow,
    tableZone,
    type BlockZoneHost,
} from "./blockZone";

class FakeElement {
    dataset: Record<string, string | undefined> = {};
    parentElement: FakeElement | null = null;
    private readonly kids: unknown[] = [];

    append(child: { parentElement: FakeElement | null }): void {
        child.parentElement = this;
        this.kids.push(child);
    }

    contains(node: unknown): boolean {
        if (node === this) {
            return true;
        }
        return this.kids.some((kid) => kid === node || (kid instanceof FakeElement && kid.contains(node)));
    }

    closest(selector: string): FakeElement | null {
        if (selector === "[data-from]" && this.dataset.from !== undefined) {
            return this;
        }
        return this.parentElement?.closest(selector) ?? null;
    }
}

class LooseNode {
    parentElement: FakeElement | null = null;
}

class TestNode {
    parentElement: TestElement | null = null;
    childNodes: TestNode[] = [];
}

class TestElement extends TestNode {
    readonly tag: string;
    className = "";
    textContent = "";
    dataset: Record<string, string | undefined> = {};
    style = { display: "" };
    type = "";
    title = "";
    alt = "";
    src = "";
    isConnected = false;
    offsetHeight = 0;
    scrollHeight = 0;
    private readonly listeners = new Map<string, Array<(event: MouseEvent) => void>>();

    constructor(tag: string) {
        super();
        this.tag = tag;
    }

    append(child: TestNode): void {
        child.parentElement = this;
        this.childNodes.push(child);
    }

    replaceChildren(...children: TestNode[]): void {
        for (const child of this.childNodes) {
            child.parentElement = null;
        }
        this.childNodes = [];
        for (const child of children) {
            this.append(child);
        }
    }

    addEventListener(type: string, listener: (event: MouseEvent) => void): void {
        const bucket = this.listeners.get(type) ?? [];
        bucket.push(listener);
        this.listeners.set(type, bucket);
    }

    fire(type: string, event: Partial<MouseEvent> & { target?: unknown }): void {
        const mouse = {
            preventDefault: vi.fn(),
            stopPropagation: vi.fn(),
            clientX: 0,
            clientY: 0,
            ...event,
        } as MouseEvent;
        for (const listener of this.listeners.get(type) ?? []) {
            listener(mouse);
        }
    }

    contains(node: unknown): boolean {
        if (node === this) {
            return true;
        }
        return this.childNodes.some((kid) => kid === node || (kid instanceof TestElement && kid.contains(node)));
    }

    matches(selector: string): boolean {
        if (selector === "td, th") {
            return this.tag === "td" || this.tag === "th";
        }
        if (selector === "[data-from]") {
            return this.dataset.from !== undefined;
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

    querySelector(selector: string): TestElement | null {
        for (const child of this.childNodes) {
            if (!(child instanceof TestElement)) {
                continue;
            }
            if (child.matches(selector)) {
                return child;
            }
            const nested = child.querySelector(selector);
            if (nested) {
                return nested;
            }
        }
        return null;
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

class TestImage extends TestElement {
    naturalWidth = 0;
    naturalHeight = 0;

    constructor() {
        super("img");
        probes.push(this);
    }
}

const probes: TestImage[] = [];
const created: TestElement[] = [];
const computedStyle = {
    paddingTop: "0px",
    paddingBottom: "0px",
    borderTopWidth: "0px",
    borderBottomWidth: "0px",
};
let runFrames = true;
let queuedFrame: FrameRequestCallback | undefined;

const priorDocument = globalThis.document;
const priorElement = globalThis.Element;
const priorHtmlElement = globalThis.HTMLElement;
const priorNode = globalThis.Node;
const priorImage = globalThis.Image;
const priorGetComputedStyle = globalThis.getComputedStyle;
const priorRequestAnimationFrame = globalThis.requestAnimationFrame;

function installDom(
    caret: { offsetNode: unknown; offset: number } | null,
    range: { startContainer: unknown; startOffset: number } | null = null,
): void {
    const ElementCtor = FakeElement as unknown as typeof Element;
    globalThis.Element = ElementCtor;
    globalThis.HTMLElement = ElementCtor as unknown as typeof HTMLElement;
    globalThis.document = {
        caretPositionFromPoint: () => caret,
        caretRangeFromPoint: () => range,
    } as unknown as Document;
}

function installRichDom(): void {
    probes.length = 0;
    created.length = 0;
    queuedFrame = undefined;
    runFrames = true;
    computedStyle.paddingTop = "0px";
    computedStyle.paddingBottom = "0px";
    computedStyle.borderTopWidth = "0px";
    computedStyle.borderBottomWidth = "0px";
    globalThis.Node = TestNode as unknown as typeof Node;
    globalThis.Element = TestElement as unknown as typeof Element;
    globalThis.HTMLElement = TestElement as unknown as typeof HTMLElement;
    globalThis.Image = TestImage as unknown as typeof Image;
    globalThis.getComputedStyle = (() => computedStyle) as unknown as typeof getComputedStyle;
    globalThis.requestAnimationFrame = ((callback: FrameRequestCallback) => {
        if (runFrames) {
            callback(0);
        } else {
            queuedFrame = callback;
        }
        return 1;
    }) as typeof requestAnimationFrame;
    globalThis.document = {
        createElement: (tag: string) => {
            const node = new TestElement(tag);
            created.push(node);
            return node;
        },
        caretPositionFromPoint: () => null,
        caretRangeFromPoint: () => null,
    } as unknown as Document;
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

function createHost(overrides: Partial<BlockZoneHost> = {}): BlockZoneHost {
    return {
        onReveal: vi.fn(),
        onLayout: vi.fn(),
        documentUrl: "http://doc.test/readme.md",
        lineHeight: 20,
        ...overrides,
    };
}

function element(node: unknown): TestElement {
    return node as unknown as TestElement;
}

function mouse(target?: unknown): MouseEvent {
    return {
        preventDefault: vi.fn(),
        stopPropagation: vi.fn(),
        clientX: 3,
        clientY: 4,
        target,
    } as unknown as MouseEvent;
}

async function flush(): Promise<void> {
    await Promise.resolve();
    await Promise.resolve();
}

afterEach(() => {
    globalThis.document = priorDocument;
    globalThis.Element = priorElement;
    globalThis.HTMLElement = priorHtmlElement;
    globalThis.Node = priorNode;
    globalThis.Image = priorImage;
    globalThis.getComputedStyle = priorGetComputedStyle;
    globalThis.requestAnimationFrame = priorRequestAnimationFrame;
    vi.mocked(renderMermaidDiagram).mockReset();
});

describe("headingLevel", () => {
    it("keeps levels 1 through 6 and truncates fractional levels", () => {
        expect(headingLevel(scope({ kind: "heading", level: 1 }))).toBe(1);
        expect(headingLevel(scope({ kind: "heading", level: 6 }))).toBe(6);
        expect(headingLevel(scope({ kind: "heading", level: 3.9 }))).toBe(3);
    });

    it("falls back when level is missing or outside 1..6", () => {
        expect(headingLevel(scope({ kind: "heading" }))).toBe(1);
        expect(headingLevel(scope({ kind: "heading", level: 0 }))).toBe(1);
        expect(headingLevel(scope({ kind: "heading", level: 7 }))).toBe(1);
        expect(headingLevel(scope({ kind: "heading", level: Number.NaN }))).toBe(1);
    });
});

describe("contentClass", () => {
    it("maps inline and heading scopes onto classes", () => {
        expect(contentClass(scope({ kind: "heading", level: 2 }))).toBe("inline-md-h2");
        expect(contentClass(scope({ kind: "strong" }))).toBe("inline-md-strong");
        expect(contentClass(scope({ kind: "emphasis" }))).toBe("inline-md-em");
        expect(contentClass(scope({ kind: "strikethrough" }))).toBe("inline-md-strike");
        expect(contentClass(scope({ kind: "inlineCode" }))).toBe("inline-md-code");
        expect(contentClass(scope({ kind: "link" }))).toBe("inline-md-link");
    });

    it("returns undefined for block scopes", () => {
        expect(contentClass(scope({ kind: "image" }))).toBeUndefined();
        expect(contentClass(scope({ kind: "table" }))).toBeUndefined();
    });
});

describe("imageZoneKey", () => {
    it("keys a resolved url and a missing image", () => {
        expect(imageZoneKey("./pic.png", 4, "http://doc.test/readme.md")).toBe("image:4:http://doc.test/pic.png");
        expect(imageZoneKey("https://cdn.test/a.png", 2, "")).toBe("image:2:https://cdn.test/a.png");
        expect(imageZoneKey("javascript:alert(1)", 8, "http://doc.test/readme.md")).toBe("image:8:missing");
        expect(imageZoneKey(undefined, 3, "http://doc.test/readme.md")).toBe("image:3:missing");
        expect(imageZoneKey("", 3, "http://doc.test/readme.md")).toBe("image:3:missing");
    });
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

    it("reads a caret range when caretPositionFromPoint is absent", () => {
        const cell = new FakeElement();
        cell.dataset.start = "10";
        cell.dataset.end = "30";
        const marked = new FakeElement();
        marked.dataset.from = "18";
        const text = new LooseNode();
        marked.append(text);
        cell.append(marked);
        const ElementCtor = FakeElement as unknown as typeof Element;
        globalThis.Element = ElementCtor;
        globalThis.HTMLElement = ElementCtor as unknown as typeof HTMLElement;
        globalThis.document = {
            caretRangeFromPoint: () => ({ startContainer: text, startOffset: 2 }),
        } as unknown as Document;
        expect(tableCellOffset({ clientX: 1, clientY: 1 } as MouseEvent, cell as unknown as HTMLElement, 10)).toBe(20);
    });

    it("uses a range when caretPositionFromPoint returns null", () => {
        const cell = new FakeElement();
        cell.dataset.start = "10";
        cell.dataset.end = "20";
        const marked = new FakeElement();
        marked.dataset.from = "10";
        cell.append(marked);
        installDom(null, { startContainer: marked, startOffset: 0 });
        expect(tableCellOffset({ clientX: 1, clientY: 1 } as MouseEvent, cell as unknown as HTMLElement, 4)).toBe(10);
    });

    it("returns data-start when the caret is outside the cell or the marker is unusable", () => {
        const cell = new FakeElement();
        cell.dataset.start = "10";
        cell.dataset.end = "20";
        const outside = new FakeElement();
        outside.dataset.from = "12";
        installDom({ offsetNode: outside, offset: 1 });
        expect(tableCellOffset({ clientX: 0, clientY: 0 } as MouseEvent, cell as unknown as HTMLElement, 3)).toBe(10);

        const unmarked = new FakeElement();
        cell.append(unmarked);
        installDom({ offsetNode: unmarked, offset: 1 });
        expect(tableCellOffset({ clientX: 0, clientY: 0 } as MouseEvent, cell as unknown as HTMLElement, 3)).toBe(10);

        const bad = new FakeElement();
        bad.dataset.from = "nope";
        cell.append(bad);
        installDom({ offsetNode: bad, offset: 1 });
        expect(tableCellOffset({ clientX: 0, clientY: 0 } as MouseEvent, cell as unknown as HTMLElement, 3)).toBe(10);
    });

    it("rejects caret offsets outside the cell range", () => {
        const cell = new FakeElement();
        cell.dataset.start = "10";
        cell.dataset.end = "20";
        const early = new FakeElement();
        early.dataset.from = "4";
        cell.append(early);
        installDom({ offsetNode: early, offset: 0 });
        expect(tableCellOffset({ clientX: 0, clientY: 0 } as MouseEvent, cell as unknown as HTMLElement, 3)).toBe(10);

        const late = new FakeElement();
        late.dataset.from = "19";
        cell.append(late);
        installDom({ offsetNode: late, offset: 4 });
        expect(tableCellOffset({ clientX: 0, clientY: 0 } as MouseEvent, cell as unknown as HTMLElement, 3)).toBe(10);
    });

    it("returns data-start when the cell end is not a number and the fallback when the start is not", () => {
        const cell = new FakeElement();
        cell.dataset.start = "10";
        const marked = new FakeElement();
        marked.dataset.from = "12";
        cell.append(marked);
        installDom({ offsetNode: marked, offset: 1 });
        expect(tableCellOffset({ clientX: 0, clientY: 0 } as MouseEvent, cell as unknown as HTMLElement, 7)).toBe(10);

        const open = new FakeElement();
        const inside = new FakeElement();
        inside.dataset.from = "12";
        open.append(inside);
        installDom({ offsetNode: inside, offset: 1 });
        expect(tableCellOffset({ clientX: 0, clientY: 0 } as MouseEvent, open as unknown as HTMLElement, 7)).toBe(7);
    });

    it("ignores a marker that is not an HTMLElement", () => {
        const cell = new FakeElement();
        cell.dataset.start = "10";
        cell.dataset.end = "20";
        const text = new FakeElement();
        text.dataset.from = "12";
        cell.append(text);
        installDom({ offsetNode: text, offset: 2 });
        globalThis.HTMLElement = class {} as unknown as typeof HTMLElement;
        expect(tableCellOffset({ clientX: 1, clientY: 1 } as MouseEvent, cell as unknown as HTMLElement, 10)).toBe(10);
    });
});

describe("tableRow", () => {
    it("trims surrounding spaces and tabs and renders nested inline scopes", () => {
        installRichDom();
        const source = " \tabcdefghij\t ";
        const row = element(tableRow(source, [
            scope({ kind: "heading", start: 0, end: 4, contentStart: 1, contentEnd: 3, level: 2 }),
            scope({ kind: "emphasis", start: -1, end: 4, contentStart: 0, contentEnd: 1 }),
            scope({ kind: "inlineCode", start: 1, end: 50, contentStart: 1, contentEnd: 2 }),
            scope({ kind: "link", start: 2, end: 2, contentStart: 2, contentEnd: 2 }),
            scope({ kind: "strong", start: 4, end: 10, contentStart: 5, contentEnd: 9 }),
            scope({ kind: "emphasis", start: 5, end: 8, contentStart: 6, contentEnd: 7 }),
            scope({ kind: "inlineCode", start: 5, end: 7, contentStart: 6, contentEnd: 6 }),
            scope({ kind: "link", start: 10, end: 12, contentStart: 11, contentEnd: 12, url: "https://example.com/a" }),
        ], [{ start: 0, end: source.length }], "td"));
        const cell = element(row.childNodes[0]);
        expect(cell.dataset.start).toBe("2");
        expect(cell.dataset.end).toBe("12");
        const top = cell.childNodes.filter((node): node is TestElement => node instanceof TestElement);
        expect(top.map((node) => node.className || node.textContent)).toEqual([
            "inline-md-link",
            "b",
            "inline-md-strong",
            "inline-md-link",
        ]);
        expect(top[0]?.dataset.href).toBeUndefined();
        const strong = top[2]?.childNodes.filter((node): node is TestElement => node instanceof TestElement) ?? [];
        expect(strong.map((node) => node.className || node.textContent)).toEqual(["inline-md-em", "g"]);
        expect(element(strong[0]?.childNodes[0]).dataset.from).toBe("6");
        expect(element(strong[0]?.childNodes[0]).textContent).toBe("e");
        expect(top[3]?.dataset.href).toBe("https://example.com/a");
        expect(element(top[3]?.childNodes[0]).textContent).toBe("j");
    });

    it("emits plain text when the next scope starts at the cell end or lies outside it", () => {
        installRichDom();
        const boundary = element(tableRow("abcd", [
            scope({ kind: "strong", start: 4, end: 4, contentStart: 4, contentEnd: 4 }),
        ], [{ start: 0, end: 4 }], "th"));
        const boundaryCell = element(boundary.childNodes[0]);
        expect(boundaryCell.childNodes).toHaveLength(1);
        expect(element(boundaryCell.childNodes[0]).textContent).toBe("abcd");

        const plain = element(tableRow("ab", [
            scope({ kind: "strong", start: 5, end: 6, contentStart: 5, contentEnd: 6 }),
        ], [{ start: 0, end: 2 }], "td"));
        expect(element(element(plain.childNodes[0]).childNodes[0]).textContent).toBe("ab");

        const empty = element(tableRow("   ", [], [{ start: 0, end: 3 }], "td"));
        expect(element(empty.childNodes[0]).childNodes).toHaveLength(0);
        expect(element(empty.childNodes[0]).dataset.start).toBe("3");
    });
});

describe("blockZone", () => {
    it("builds a thematic break that reveals the source offset", () => {
        installRichDom();
        const host = createHost();
        const record = blockZone(scope({ kind: "thematicBreak", start: 5, end: 8 }), 5, 3, host);
        expect(record.key).toBe("hr:5");
        expect(record.zone.afterLineNumber).toBe(2);
        expect(record.zone.heightInPx).toBe(20);
        expect(record.zone.suppressMouseDown).toBe(true);
        expect(element(record.zone.marginDomNode).textContent).toBe("3");
        const event = mouse(record.zone.domNode);
        element(record.zone.domNode).fire("mousedown", event);
        expect(event.preventDefault).toHaveBeenCalled();
        expect(event.stopPropagation).toHaveBeenCalled();
        expect(host.onReveal).toHaveBeenCalledWith(6);
    });

    it("shows a fallback when the image url is missing or unsafe", () => {
        installRichDom();
        const host = createHost();
        const missing = blockZone(scope({ kind: "image", start: 1, end: 2 }), 1, 2, host);
        expect(missing.key).toBe("image:1:missing");
        const fallback = element(missing.zone.domNode).find(".inline-md-image-fallback");
        expect(fallback?.textContent).toBe("Image");
        const missingEvent = mouse(fallback);
        fallback?.fire("mousedown", missingEvent);
        expect(missingEvent.preventDefault).toHaveBeenCalled();
        expect(host.onReveal).toHaveBeenCalledWith(2);

        const blankAlt = blockZone(scope({ kind: "image", alt: "", url: "   " }), 4, 2, host);
        expect(blankAlt.key).toBe("image:4:missing");
        expect(element(blankAlt.zone.domNode).find(".inline-md-image-fallback")?.textContent).toBe("Image");

        const labeled = blockZone(scope({ kind: "image", alt: "Shot", url: "javascript:alert(1)" }), 6, 2, host);
        expect(labeled.key).toBe("image:6:missing");
        expect(element(labeled.zone.domNode).find(".inline-md-image-fallback")?.textContent).toBe("Shot");
        expect(probes).toHaveLength(0);
    });

    it("fits a loaded image and ignores a second load once settled", () => {
        installRichDom();
        const host = createHost();
        const record = blockZone(scope({ kind: "image", alt: "Shot", url: "./pic.png" }), 9, 4, host);
        expect(record.key).toBe("image:9:http://doc.test/pic.png");
        const probe = probes[0];
        expect(probe?.src).toBe("http://doc.test/pic.png");
        probe!.naturalWidth = 10;
        probe!.naturalHeight = 20;
        probe!.fire("load", {});
        expect(record.zone.heightInPx).toBe(20);
        expect(host.onLayout).not.toHaveBeenCalled();
        const image = element(record.zone.domNode).find(".inline-md-image");
        expect(image?.alt).toBe("Shot");
        const event = mouse(image);
        image?.fire("mousedown", event);
        expect(host.onReveal).toHaveBeenCalledWith(10);

        probe!.naturalWidth = 10;
        probe!.naturalHeight = 80;
        probe!.fire("load", {});
        probe!.fire("error", {});
        expect(record.zone.heightInPx).toBe(20);
        expect(element(record.zone.domNode).find(".inline-md-image")).toBeDefined();
        expect(host.onLayout).not.toHaveBeenCalled();
    });

    it("asks for layout when the fitted height differs and when height was cleared", () => {
        installRichDom();
        const host = createHost();
        const grown = blockZone(scope({ kind: "image", url: "https://cdn.test/a.png" }), 2, 1, host);
        const grownProbe = probes[0];
        grownProbe!.naturalWidth = 960;
        grownProbe!.naturalHeight = 480;
        grownProbe!.fire("load", {});
        expect(grown.zone.heightInPx).toBe(240);
        expect(host.onLayout).toHaveBeenCalledWith(grown.key);

        const cleared = blockZone(scope({ kind: "image", url: "https://cdn.test/b.png" }), 3, 1, host);
        cleared.zone.heightInPx = undefined;
        const clearedProbe = probes[1];
        clearedProbe!.naturalWidth = 10;
        clearedProbe!.naturalHeight = 20;
        clearedProbe!.fire("load", {});
        expect(cleared.zone.heightInPx).toBe(20);
        expect(host.onLayout).toHaveBeenCalledWith(cleared.key);
    });

    it("falls back when the image errors or reports an empty size", () => {
        installRichDom();
        const host = createHost();
        const broken = blockZone(scope({ kind: "image", alt: "Gone", url: "https://cdn.test/missing.png" }), 7, 2, host);
        const brokenProbe = probes[0];
        brokenProbe!.fire("error", {});
        expect(element(broken.zone.domNode).find(".inline-md-image-fallback")?.textContent).toBe("Gone");
        brokenProbe!.naturalWidth = 40;
        brokenProbe!.naturalHeight = 40;
        brokenProbe!.fire("load", {});
        brokenProbe!.fire("error", {});
        expect(element(broken.zone.domNode).find(".inline-md-image")).toBeUndefined();
        expect(host.onLayout).not.toHaveBeenCalled();

        const empty = blockZone(scope({ kind: "image", url: "https://cdn.test/empty.png" }), 8, 2, host);
        const emptyProbe = probes[1];
        emptyProbe!.naturalWidth = 0;
        emptyProbe!.naturalHeight = 30;
        emptyProbe!.fire("load", {});
        expect(element(empty.zone.domNode).find(".inline-md-image-fallback")?.textContent).toBe("Image");
        const flat = blockZone(scope({ kind: "image", url: "https://cdn.test/flat.png" }), 11, 2, host);
        const flatProbe = probes[2];
        flatProbe!.naturalWidth = 30;
        flatProbe!.naturalHeight = 0;
        flatProbe!.fire("load", {});
        expect(element(flat.zone.domNode).find(".inline-md-image-fallback")).toBeDefined();
        expect(host.onLayout).not.toHaveBeenCalled();
    });
});

describe("createMermaidZone", () => {
    it("opens the preview from the button and reveals source from the diagram", async () => {
        installRichDom();
        vi.mocked(renderMermaidDiagram).mockResolvedValue(90);
        const host = createHost({ onOpenMermaidPreview: vi.fn() });
        const record = createMermaidZone(scope({ kind: "codeBlock", contentStart: 8 }), "graph TD;", "mermaid:8", 5, host);
        const frame = element(record.zone.domNode);
        expect(record.zone.heightInPx).toBe(120);
        expect(element(record.zone.marginDomNode).textContent).toBe("5");
        const open = created.find((node) => node.className === "inline-md-mermaid-open-preview");
        expect(open?.textContent).toBe("Open Preview");
        const buttonEvent = mouse(open);
        open?.fire("mousedown", buttonEvent);
        expect(buttonEvent.preventDefault).toHaveBeenCalled();
        expect(host.onOpenMermaidPreview).toHaveBeenCalledWith(4);

        const child = new TestElement("span");
        open?.append(child);
        const nested = mouse(child);
        frame.fire("mousedown", nested);
        expect(nested.preventDefault).not.toHaveBeenCalled();
        expect(host.onReveal).not.toHaveBeenCalled();

        const diagram = frame.find(".inline-md-mermaid-diagram");
        const diagramEvent = mouse(diagram);
        frame.fire("mousedown", diagramEvent);
        expect(diagramEvent.preventDefault).toHaveBeenCalled();
        expect(host.onReveal).toHaveBeenCalledWith(9);

        const text = new TestNode();
        const textEvent = mouse(text);
        frame.fire("mousedown", textEvent);
        expect(host.onReveal).toHaveBeenCalledWith(9);
        const render = vi.mocked(renderMermaidDiagram).mock.calls[0];
        expect(render?.[0]).toBe(diagram);
        expect(render?.[1]).toBe("graph TD;");
        frame.isConnected = false;
        await flush();
        expect(record.zone.heightInPx).toBe(120);
    });

    it("does nothing when preview handler is missing or the diagram height is empty", async () => {
        installRichDom();
        vi.mocked(renderMermaidDiagram).mockResolvedValue(0);
        const host = createHost();
        const record = createMermaidZone(scope({ kind: "codeBlock", contentStart: 1 }), "graph", "mermaid:1", 2, host);
        const button = created.find((node) => node.className === "inline-md-mermaid-open-preview");
        const event = mouse(button);
        button?.fire("mousedown", event);
        expect(host.onReveal).not.toHaveBeenCalled();
        element(record.zone.domNode).isConnected = true;
        await flush();
        expect(record.zone.heightInPx).toBe(120);
        expect(host.onLayout).not.toHaveBeenCalled();
    });

    it("refits a connected diagram from scroll height", async () => {
        installRichDom();
        runFrames = false;
        vi.mocked(renderMermaidDiagram).mockResolvedValue(80);
        const host = createHost();
        const record = createMermaidZone(scope({ kind: "codeBlock", contentStart: 2 }), "graph", "mermaid:2", 3, host);
        const frame = element(record.zone.domNode);
        frame.isConnected = true;
        frame.scrollHeight = 81;
        await flush();
        expect(record.zone.heightInPx).toBe(80);
        queuedFrame?.(0);
        expect(host.onLayout).not.toHaveBeenCalled();

        frame.scrollHeight = 0;
        queuedFrame?.(0);
        expect(record.zone.heightInPx).toBe(80);

        frame.scrollHeight = 140;
        frame.isConnected = false;
        queuedFrame?.(0);
        expect(host.onLayout).not.toHaveBeenCalled();

        frame.isConnected = true;
        record.zone.heightInPx = undefined;
        frame.scrollHeight = 140;
        queuedFrame?.(0);
        expect(record.zone.heightInPx).toBe(140);
        expect(host.onLayout).toHaveBeenCalledWith("mermaid:2");
    });
});

describe("tableZone", () => {
    const source = "NameGo";
    const head = [{ start: 0, end: 4 }];
    const body = [{ start: 4, end: 6 }];
    const scopes = [
        scope({ kind: "link", start: 4, end: 6, contentStart: 5, contentEnd: 6, url: "https://example.com/go" }),
    ];

    it("reveals cells, follows links, and walks text targets", () => {
        installRichDom();
        const host = createHost({ onLink: vi.fn() });
        const record = tableZone(scope({ kind: "table", start: 3, end: 9, rows: [head, body, []] }), source, scopes, 50, 6, host);
        expect(record.key).toBe("table:3:9");
        expect(record.zone.heightInPx).toBe(96);
        expect(element(record.zone.marginDomNode).textContent).toBe("6");
        const frame = element(record.zone.domNode);
        const link = frame.find(".inline-md-link");
        const linkEvent = mouse(link);
        frame.fire("mousedown", linkEvent);
        expect(linkEvent.preventDefault).toHaveBeenCalled();
        expect(linkEvent.stopPropagation).toHaveBeenCalled();
        expect(host.onLink).toHaveBeenCalledWith("https://example.com/go");
        expect(host.onReveal).not.toHaveBeenCalled();

        const header = frame.find("th");
        frame.fire("mousedown", mouse(header));
        expect(host.onReveal).toHaveBeenCalledWith(0);

        const text = new TestNode();
        frame.find("td")?.append(text);
        frame.fire("mousedown", mouse(text));
        expect(host.onReveal).toHaveBeenCalledWith(4);

        const linked = new TestNode();
        link?.append(linked);
        frame.fire("mousedown", mouse(linked));
        expect(host.onLink).toHaveBeenCalledTimes(2);

        frame.fire("mousedown", mouse(null));
        expect(host.onReveal).toHaveBeenCalledWith(51);

        const orphan = new TestNode();
        frame.fire("mousedown", mouse(orphan));
        expect(host.onReveal).toHaveBeenCalledWith(51);
    });

    it("reveals the cell when a link has no click handler", () => {
        installRichDom();
        const host = createHost();
        const record = tableZone(scope({ kind: "table", rows: [head, body] }), source, scopes, 50, 2, host);
        const frame = element(record.zone.domNode);
        frame.fire("mousedown", mouse(frame.find(".inline-md-link")));
        expect(host.onReveal).toHaveBeenCalledWith(4);
    });

    it("builds a header-only table and an empty table", () => {
        installRichDom();
        const headerOnly = tableZone(scope({ kind: "table", start: 1, end: 2, rows: [head] }), source, [], 0, 1, createHost());
        const headerFrame = element(headerOnly.zone.domNode);
        expect(headerFrame.find("th")).toBeDefined();
        expect(headerFrame.find("td")).toBeUndefined();

        const empty = tableZone(scope({ kind: "table", start: 0, end: 1 }), "", [], 4, 1, createHost());
        expect(empty.zone.heightInPx).toBe(28);
        expect(element(empty.zone.domNode).querySelector("table")?.childNodes).toHaveLength(0);
    });

    it("measures padding and border, skips a close or empty height, and defers while hidden", () => {
        installRichDom();
        const host = createHost();
        const record = tableZone(scope({ kind: "table", start: 1, end: 4, rows: [head] }), source, [], 0, 1, host);
        const frame = element(record.zone.domNode);
        const table = frame.querySelector("table");
        expect(table).not.toBeNull();
        table!.offsetHeight = 32;
        record.zone.onDomNodeTop?.(0);
        expect(host.onLayout).not.toHaveBeenCalled();

        table!.offsetHeight = 0;
        record.zone.onDomNodeTop?.(0);
        expect(host.onLayout).not.toHaveBeenCalled();

        computedStyle.paddingTop = "8px";
        computedStyle.paddingBottom = "0px";
        computedStyle.borderTopWidth = "1.5px";
        computedStyle.borderBottomWidth = "";
        table!.offsetHeight = 10;
        record.zone.onDomNodeTop?.(0);
        expect(record.zone.heightInPx).toBe(20);
        expect(host.onLayout).toHaveBeenCalledWith("table:1:4");

        computedStyle.paddingTop = "0px";
        computedStyle.paddingBottom = "0px";
        computedStyle.borderTopWidth = "0px";
        computedStyle.borderBottomWidth = "0px";
        frame.replaceChildren();
        frame.scrollHeight = 40;
        record.zone.onDomNodeTop?.(0);
        expect(record.zone.heightInPx).toBe(40);

        runFrames = false;
        frame.style.display = "none";
        frame.scrollHeight = 70;
        record.zone.onDomNodeTop?.(0);
        expect(record.zone.heightInPx).toBe(40);
        queuedFrame?.(0);
        expect(record.zone.heightInPx).toBe(70);

        record.zone.heightInPx = undefined;
        frame.scrollHeight = 15;
        frame.style.display = "";
        record.zone.onDomNodeTop?.(0);
        expect(record.zone.heightInPx).toBe(15);
    });
});
