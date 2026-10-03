import { describe, expect, it } from "vitest";
import { listeningHttpUrl } from "./listeningHttpUrl";

describe("listeningHttpUrl", () => {
    it("keeps a loopback address and rewrites wildcard hosts", () => {
        expect(listeningHttpUrl("127.0.0.1:5175", 5175)).toBe("http://127.0.0.1:5175");
        expect(listeningHttpUrl("[::1]:5175", 5175)).toBe("http://[::1]:5175");
        expect(listeningHttpUrl("*:54321", 54321)).toBe("http://127.0.0.1:54321");
        expect(listeningHttpUrl("0.0.0.0:3000", 3000)).toBe("http://127.0.0.1:3000");
    });
});
