import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
    bindDragSelection,
    dragSelectionClassName,
    isDragSelecting,
    extendSelectionAboveLine,
    layoutSelectionPieces,
    extendHeadingSelectionPastText,
    selectionHeadingSelector,
    stretchesSelectionLine,
    type SelectionBox,
} from "./selection";

const here = dirname(fileURLToPath(import.meta.url));

function box(top: number, height: number, left = 40, width = 20, styleHeight = "", styleBottom = "0px"): SelectionBox {
    return {
        top,
        left,
        width,
        height,
        styleTop: "0px",
        styleLeft: "0px",
        styleBottom,
        styleHeight,
        styleWidth: `${width}px`,
        radius: [],
    };
}

describe("selection highlight", () => {
    it("paints the selection on every selected line, including lines that are not headings", () => {
        const source = readFileSync(join(here, "decorations.ts"), "utf8");
        const body = source.slice(
            source.indexOf("private applySelectionHeights"),
            source.indexOf("private syncZones"),
        );
        expect(body).not.toMatch(/for \(const piece of pieces\) \{\s*piece\.style\.bottom = "";\s*piece\.style\.height = "";\s*\}/);
        expect(body).toContain("stretchesSelectionLine");

        const paragraph = box(80, 20);
        const heading = box(40, 20);
        layoutSelectionPieces(
            [paragraph, heading],
            [
                { top: 40, height: 34, stretchToLineHeight: true },
                { top: 80, height: 20, stretchToLineHeight: false },
            ],
        );
        expect(paragraph.styleBottom).toBe("0px");
        expect(paragraph.styleHeight).toBe("");
        expect(heading.styleBottom).toBe("auto");
        expect(heading.styleHeight).toBe("34px");

        const stale = box(10, 34, 40, 20, "34px", "auto");
        layoutSelectionPieces([stale], [{ top: 10, height: 20, stretchToLineHeight: false }]);
        expect(stale.styleBottom).toBe("0px");
        expect(stale.styleHeight).toBe("");

        const listEnd = box(60, 20);
        layoutSelectionPieces(
            [listEnd],
            [{ top: 60, height: 24, stretchToLineHeight: true }],
        );
        expect(listEnd.styleHeight).toBe("24px");
    });

    it("stretches a heading line when the selection sits on the bottom of the line", () => {
        const heading = box(52, 18);
        layoutSelectionPieces(
            [heading],
            [{ top: 40, height: 34, stretchToLineHeight: true }],
        );
        expect(heading.styleHeight).toBe("34px");
        expect(heading.styleBottom).toBe("auto");
    });

    it("extends a stretched heading selection through the gap above the line", () => {
        const heading = box(52, 34, 40, 20, "34px", "auto");
        extendSelectionAboveLine(heading, 34, 4);
        expect(heading.styleTop).toBe("-4px");
        expect(heading.styleHeight).toBe("38px");
        expect(heading.styleBottom).toBe("auto");
    });

    it("extends a heading selection a little past the glyphs", () => {
        const heading = box(40, 19, 40, 74);
        extendHeadingSelectionPastText(heading, 114, 5);
        expect(heading.styleWidth).toBe("79px");
        extendHeadingSelectionPastText(heading, 114, 5);
        expect(heading.styleWidth).toBe("79px");
    });

    it("leaves a line alone when it already matches the selection height", () => {
        const fitted = box(10, 20);
        const distant = box(14, 20);
        layoutSelectionPieces(
            [fitted, distant],
            [{ top: 10, height: 20.5, stretchToLineHeight: true }],
        );
        expect(fitted.styleTop).toBe("0px");
        expect(fitted.styleBottom).toBe("0px");
        expect(fitted.styleHeight).toBe("");
        expect(distant.styleHeight).toBe("");

        const preset = box(10, 30, 40, 20, "30px", "auto");
        layoutSelectionPieces([preset], [{ top: 10, height: 20, stretchToLineHeight: true }]);
        expect(preset.styleTop).toBe("0px");
        expect(preset.styleBottom).toBe("auto");
        expect(preset.styleHeight).toBe("20px");
    });
});

describe("stretchesSelectionLine", () => {
    it("stretches headings and list-gap lines", () => {
        const selectors: string[] = [];
        const heading = {
            querySelector(selector: string) {
                selectors.push(selector);
                return { tag: "h1" };
            },
            classList: { contains: () => false },
        };
        expect(stretchesSelectionLine(heading)).toBe(true);
        expect(selectors).toEqual([selectionHeadingSelector]);

        const gap = {
            querySelector: () => null,
            classList: { contains: (name: string) => name === "inline-md-list-gap-after" },
        };
        expect(stretchesSelectionLine(gap)).toBe(true);

        const plain = {
            querySelector: () => null,
            classList: { contains: () => false },
        };
        expect(stretchesSelectionLine(plain)).toBe(false);
    });
});

type PointerEvent = { button: number; buttons: number };

function pointerTarget() {
    const listeners = new Map<string, Array<(event: PointerEvent) => void>>();
    return {
        addEventListener(type: string, listener: (event: PointerEvent) => void) {
            listeners.set(type, [...(listeners.get(type) ?? []), listener]);
        },
        removeEventListener(type: string, listener: (event: PointerEvent) => void) {
            listeners.set(type, (listeners.get(type) ?? []).filter((entry) => entry !== listener));
        },
        emit(type: string, event: Partial<PointerEvent> = {}) {
            for (const listener of [...(listeners.get(type) ?? [])]) {
                listener({ button: 0, buttons: 0, ...event });
            }
        },
        listenerCount(type: string) {
            return listeners.get(type)?.length ?? 0;
        },
    };
}

function dragRoot() {
    const classes = new Set<string>();
    return {
        ...pointerTarget(),
        classList: {
            add: (name: string) => classes.add(name),
            remove: (name: string) => classes.delete(name),
            contains: (name: string) => classes.has(name),
        },
    };
}

describe("drag selection", () => {
    afterEach(() => {
        vi.unstubAllGlobals();
    });

    it("tracks the primary button until the pointer is released", () => {
        const root = dragRoot();
        const windowTarget = pointerTarget();
        vi.stubGlobal("window", windowTarget);
        const ended: number[] = [];
        const stop = bindDragSelection(root as unknown as HTMLElement, () => ended.push(ended.length + 1));

        expect(isDragSelecting()).toBe(false);
        windowTarget.emit("mousemove", { buttons: 0 });
        windowTarget.emit("mouseup");
        windowTarget.emit("blur");
        expect(ended).toEqual([]);

        root.emit("mousedown", { button: 2 });
        expect(isDragSelecting()).toBe(false);

        root.emit("mousedown", { button: 0 });
        expect(isDragSelecting()).toBe(true);
        expect(root.classList.contains(dragSelectionClassName)).toBe(true);
        windowTarget.emit("mousemove", { buttons: 1 });
        expect(isDragSelecting()).toBe(true);

        windowTarget.emit("mousemove", { buttons: 0 });
        expect(isDragSelecting()).toBe(false);
        expect(root.classList.contains(dragSelectionClassName)).toBe(false);
        expect(ended).toEqual([1]);

        root.emit("mousedown", { button: 0 });
        windowTarget.emit("mouseup");
        root.emit("mousedown", { button: 0 });
        windowTarget.emit("blur");
        expect(ended).toEqual([1, 2, 3]);

        root.emit("mousedown", { button: 0 });
        stop();
        expect(isDragSelecting()).toBe(false);
        expect(ended).toEqual([1, 2, 3, 4]);
        expect(root.listenerCount("mousedown")).toBe(0);
        expect(windowTarget.listenerCount("mousemove")).toBe(0);
        expect(windowTarget.listenerCount("mouseup")).toBe(0);
        expect(windowTarget.listenerCount("blur")).toBe(0);
        root.emit("mousedown", { button: 0 });
        expect(isDragSelecting()).toBe(false);
    });

    it("clears a drag that has no end callback", () => {
        const root = dragRoot();
        const windowTarget = pointerTarget();
        vi.stubGlobal("window", windowTarget);
        const stop = bindDragSelection(root as unknown as HTMLElement);
        root.emit("mousedown", { button: 0 });
        expect(isDragSelecting()).toBe(true);
        windowTarget.emit("mouseup");
        expect(isDragSelecting()).toBe(false);
        root.emit("mousedown", { button: 0 });
        stop();
        expect(isDragSelecting()).toBe(false);
    });
});
