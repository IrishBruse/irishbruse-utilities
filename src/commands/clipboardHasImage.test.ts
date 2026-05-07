import { describe, expect, it } from "vitest";
import { macClipboardInfoIndicatesImage, waylandTypesIndicateImage } from "./clipboardHasImage";

describe("waylandTypesIndicateImage", () => {
    it("returns false for empty stdout", () => {
        expect(waylandTypesIndicateImage("")).toBe(false);
    });

    it("returns true when an image MIME type is present", () => {
        expect(waylandTypesIndicateImage("text/plain\nimage/png\n")).toBe(true);
    });

    it("returns true for space-separated types on one line", () => {
        expect(waylandTypesIndicateImage("text/plain image/png")).toBe(true);
    });

    it("returns false when only non-image types are present", () => {
        expect(waylandTypesIndicateImage("text/plain;charset=utf-8\n")).toBe(false);
    });
});

describe("macClipboardInfoIndicatesImage", () => {
    it("returns false for empty text", () => {
        expect(macClipboardInfoIndicatesImage("")).toBe(false);
    });

    it("detects PNG on clipboard from clipboard info style output", () => {
        expect(macClipboardInfoIndicatesImage('{{«class PNGf», 1234}, {«class utf8», 0}}')).toBe(true);
    });

    it("returns false when only text types appear", () => {
        expect(macClipboardInfoIndicatesImage('{{«class utf8», 5}}')).toBe(false);
    });
});
