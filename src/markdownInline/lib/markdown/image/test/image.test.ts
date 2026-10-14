import { describe, expect, it } from "vite-plus/test";
import type { CursorContext, TextRange } from "../../../document/types";
import { imageShowsRaw } from "../raw";
import { imageZoneKey } from "../style";

function cursor(head: number, lineStart: number, lineEnd: number, anchor = head): CursorContext {
    return { selectionFrom: anchor, selectionTo: head, lineStart, lineEnd, eolLength: 1 };
}

const image: TextRange = { start: 10, end: 40 };

describe("imageShowsRaw", () => {
    it("shows the address when the selection overlaps the image", () => {
        expect(imageShowsRaw(image, cursor(20, 0, 50))).toBe(true);
        expect(imageShowsRaw(image, cursor(80, 50, 90, 0))).toBe(true);
    });

    it("shows the address when the caret is on the image line", () => {
        expect(imageShowsRaw(image, cursor(8, 0, 50))).toBe(true);
        expect(imageShowsRaw(image, cursor(10, 0, 50))).toBe(true);
        expect(imageShowsRaw(image, cursor(40, 0, 50))).toBe(true);
    });

    it("hides the address when the caret is on another line", () => {
        expect(imageShowsRaw(image, cursor(80, 50, 90))).toBe(false);
    });
});

describe("imageZoneKey", () => {
    it("keys a resolved url and a missing image", () => {
        expect(imageZoneKey("./pic.png", 4, "http://doc.test/readme.md")).toBe(
            "image:4:http://doc.test/pic.png",
        );
        expect(imageZoneKey("https://cdn.test/a.png", 2, "")).toBe(
            "image:2:https://cdn.test/a.png",
        );
        expect(imageZoneKey("javascript:alert(1)", 8, "http://doc.test/readme.md")).toBe(
            "image:8:missing",
        );
        expect(imageZoneKey(undefined, 3, "http://doc.test/readme.md")).toBe("image:3:missing");
        expect(imageZoneKey("", 3, "http://doc.test/readme.md")).toBe("image:3:missing");
    });
});
