import { describe, expect, it, vi } from "vite-plus/test";
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

    it("reveals on click but not on mousedown alone", () => {
        const onReveal = vi.fn();
        const below = { dispatchEvent: vi.fn() };
        vi.stubGlobal(
            "MouseEvent",
            class MouseEvent {
                type: string;
                clientX: number;
                clientY: number;
                constructor(type: string, init?: MouseEventInit) {
                    this.type = type;
                    this.clientX = init?.clientX ?? 0;
                    this.clientY = init?.clientY ?? 0;
                }
            } as unknown as typeof MouseEvent,
        );
        viStubWindow();
        vi.stubGlobal("document", {
            createElement(tag: string): FakeElement {
                return new FakeElement(tag);
            },
            elementFromPoint: () => below,
        });
        const frame = createRuleZoneBody(8, onReveal) as unknown as FakeElement;
        const down = {
            button: 0,
            clientX: 1,
            clientY: 2,
            screenX: 1,
            screenY: 2,
            buttons: 1,
            preventDefault: vi.fn(),
            stopPropagation: vi.fn(),
            ctrlKey: false,
            shiftKey: false,
            altKey: false,
            metaKey: false,
        } as unknown as MouseEvent;
        frame.listener?.(down);
        expect(onReveal).not.toHaveBeenCalled();
        expect(below.dispatchEvent).toHaveBeenCalled();
        window.dispatchEvent(new MouseEvent("mouseup"));
        expect(onReveal).toHaveBeenCalledWith(8);
        vi.unstubAllGlobals();
    });

    it("does not reveal after a drag", () => {
        const onReveal = vi.fn();
        const below = { dispatchEvent: vi.fn() };
        vi.stubGlobal(
            "MouseEvent",
            class MouseEvent {
                type: string;
                clientX: number;
                clientY: number;
                constructor(type: string, init?: MouseEventInit) {
                    this.type = type;
                    this.clientX = init?.clientX ?? 0;
                    this.clientY = init?.clientY ?? 0;
                }
            } as unknown as typeof MouseEvent,
        );
        viStubWindow();
        vi.stubGlobal("document", {
            createElement(tag: string): FakeElement {
                return new FakeElement(tag);
            },
            elementFromPoint: () => below,
        });
        const frame = createRuleZoneBody(8, onReveal) as unknown as FakeElement;
        const down = {
            button: 0,
            clientX: 0,
            clientY: 0,
            screenX: 0,
            screenY: 0,
            buttons: 1,
            preventDefault: vi.fn(),
            stopPropagation: vi.fn(),
            ctrlKey: false,
            shiftKey: false,
            altKey: false,
            metaKey: false,
        } as unknown as MouseEvent;
        frame.listener?.(down);
        window.dispatchEvent(new MouseEvent("mousemove", { clientX: 20, clientY: 0 }));
        window.dispatchEvent(new MouseEvent("mouseup"));
        expect(onReveal).not.toHaveBeenCalled();
        vi.unstubAllGlobals();
    });
});

function viStubWindow(): void {
    const listeners = new Map<string, Array<(event: MouseEvent) => void>>();
    vi.stubGlobal("window", {
        addEventListener(type: string, listener: (event: MouseEvent) => void): void {
            const bucket = listeners.get(type) ?? [];
            bucket.push(listener);
            listeners.set(type, bucket);
        },
        removeEventListener(type: string, listener: (event: MouseEvent) => void): void {
            const bucket = listeners.get(type);
            if (!bucket) {
                return;
            }
            listeners.set(
                type,
                bucket.filter((entry) => entry !== listener),
            );
        },
        dispatchEvent(event: MouseEvent): void {
            for (const listener of listeners.get(event.type) ?? []) {
                listener(event);
            }
        },
    });
}

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
