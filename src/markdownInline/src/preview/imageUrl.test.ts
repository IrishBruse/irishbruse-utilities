import { describe, expect, it } from "vitest";
import { resolveImageUrl } from "./imageUrl";

const documentUrl = "https://example.com/docs/readme.md";

describe("resolveImageUrl", () => {
    it("resolves a relative path against the document", () => {
        expect(resolveImageUrl("dot.png", documentUrl)).toBe("https://example.com/docs/dot.png");
        expect(resolveImageUrl("./images/dot.png", documentUrl)).toBe("https://example.com/docs/images/dot.png");
    });

    it("keeps absolute http(s) and data URLs", () => {
        expect(resolveImageUrl("https://cdn.example/a.png", documentUrl)).toBe("https://cdn.example/a.png");
        expect(resolveImageUrl("data:image/png;base64,aaaa", documentUrl)).toBe("data:image/png;base64,aaaa");
    });

    it("rejects script URLs and empty values", () => {
        expect(resolveImageUrl("javascript:alert(1)", documentUrl)).toBeUndefined();
        expect(resolveImageUrl("   ", documentUrl)).toBeUndefined();
        expect(resolveImageUrl("dot.png", "")).toBeUndefined();
    });
});
