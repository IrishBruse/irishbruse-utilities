import { describe, expect, it } from "vitest";
import {
    activeBlockSourceRange,
    activeBlockSources,
    coalesceMarkdownEdits,
    diffMarkdown,
    presentEdit,
    presentSelection,
    selectionFromViewState,
} from "./sourceInspector";

describe("diffMarkdown", () => {
    it("describes an insertion", () => {
        expect(diffMarkdown("hello", "hello!")).toEqual({
            start: 5,
            endExclusive: 5,
            deleted: "",
            inserted: "!",
        });
    });

    it("describes a deletion", () => {
        expect(diffMarkdown("hello", "hell")).toEqual({
            start: 4,
            endExclusive: 5,
            deleted: "o",
            inserted: "",
        });
    });

    it("describes a replacement in the middle", () => {
        expect(diffMarkdown("a cat sat", "a dog sat")).toEqual({
            start: 2,
            endExclusive: 5,
            deleted: "cat",
            inserted: "dog",
        });
    });

    it("keeps a shared suffix when the start changes", () => {
        expect(diffMarkdown("# Title", "## Title")).toEqual({
            start: 1,
            endExclusive: 1,
            deleted: "",
            inserted: "#",
        });
    });
});

describe("coalesceMarkdownEdits", () => {
    it("joins keystrokes that continue the same insertion", () => {
        const first = diffMarkdown("ab", "abX");
        const second = diffMarkdown("abX", "abXY");
        expect(coalesceMarkdownEdits(first, second)).toEqual({
            start: 2,
            endExclusive: 2,
            deleted: "",
            inserted: "XY",
        });
    });

    it("keeps typing onto the end of a replacement", () => {
        const replaced = { start: 0, endExclusive: 3, deleted: "cat", inserted: "dog" };
        const typed = diffMarkdown("dog sat", "dogs sat");
        expect(coalesceMarkdownEdits(replaced, typed).inserted).toBe("dogs");
    });

    it("starts over when the next edit is somewhere else", () => {
        const first = diffMarkdown("ab", "abX");
        const elsewhere = diffMarkdown("abX", "ZabX");
        expect(coalesceMarkdownEdits(first, elsewhere)).toEqual(elsewhere);
    });
});

describe("activeBlockSources", () => {
    it("lists each intersecting block separately in document order", () => {
        const text = "# Title\n\nBody line\n\nTail";
        const titleEnd = text.indexOf("\n\n") + 2;
        const bodyEnd = text.indexOf("Tail");
        const sources = activeBlockSources(text, { anchor: 0, active: bodyEnd });
        expect(sources).toHaveLength(2);
        expect(sources[0]!.source).toBe("# Title\n\n");
        expect(sources[1]!.source).toBe("Body line\n\n");
    });
});

describe("activeBlockSourceRange", () => {
    it("returns the full source span for the block under the caret", () => {
        const text = "> quote\n\nnext";
        const range = activeBlockSourceRange(text, { anchor: 2, active: 2 });
        expect(range).toBeDefined();
        expect(text.slice(range!.start, range!.endExclusive)).toBe("> quote\n\n");
    });
});

describe("presentSelection", () => {
    const text = "# Title\n\nBody line";

    it("shows the active block raw source at a collapsed caret", () => {
        const bodyOffset = text.indexOf("Body");
        const presentation = presentSelection(text, { anchor: bodyOffset, active: bodyOffset });
        expect(presentation.blocks).toHaveLength(1);
        expect(presentation.blocks[0]!.source).toBe("Body line");
        expect(presentation.label.startsWith("Active block · offsets")).toBe(true);
        expect(presentation.range).toEqual(activeBlockSourceRange(text, { anchor: bodyOffset, active: bodyOffset }));
        expect(presentation.caret).toBe(bodyOffset);
    });

    it("returns one block entry per active block when the selection spans several", () => {
        const start = text.indexOf("Body");
        const end = start + "Body".length;
        const presentation = presentSelection(text, { anchor: end, active: start });
        expect(presentation.blocks).toHaveLength(1);
        expect(presentation.blocks[0]!.source).toBe("Body line");
        expect(presentation.label.startsWith("Active block · offsets")).toBe(true);
    });

    it("clamps offsets past the end of the document", () => {
        expect(presentSelection(text, { anchor: 100, active: 100 }).caret).toBe(text.length);
    });

    it("says when nothing is selected", () => {
        expect(presentSelection(text, undefined).label).toBe("No active block");
    });
});

describe("presentEdit", () => {
    it("names an insertion and the range it occupies afterwards", () => {
        expect(presentEdit({ start: 5, endExclusive: 5, deleted: "", inserted: "!" })).toEqual({
            label: "Inserted 1 character at offset 5",
            deleted: "",
            inserted: "!",
            insertedRange: { start: 5, endExclusive: 6 },
        });
    });

    it("names a deletion without an inserted range", () => {
        expect(presentEdit({ start: 0, endExclusive: 3, deleted: "cat", inserted: "" })).toEqual({
            label: "Deleted 3 characters at offsets 0 to 3",
            deleted: "cat",
            inserted: "",
            insertedRange: undefined,
        });
    });

    it("names a replacement", () => {
        expect(presentEdit({ start: 2, endExclusive: 5, deleted: "cat", inserted: "dog" }).label).toBe(
            "Replaced 3 characters at offsets 2 to 5 with 3 characters",
        );
    });
});

describe("selectionFromViewState", () => {
    it("reads anchor and active offsets", () => {
        expect(selectionFromViewState({ scrollTop: 12, selection: { anchor: 1, active: 4 } })).toEqual({
            anchor: 1,
            active: 4,
        });
    });

    it("ignores state that has no selection", () => {
        expect(selectionFromViewState({ scrollTop: 12 })).toBeUndefined();
        expect(selectionFromViewState(undefined)).toBeUndefined();
        expect(selectionFromViewState({ selection: { anchor: 1 } })).toBeUndefined();
    });
});
