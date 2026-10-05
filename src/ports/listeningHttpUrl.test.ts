import { describe, expect, it } from "vitest";
import { listeningHttpUrl } from "./listeningHttpUrl";

describe("listeningHttpUrl", () => {
    it("opens loopback and wildcard binds on localhost", () => {
        expect(listeningHttpUrl("127.0.0.1:5175", 5175)).toBe("http://localhost:5175");
        expect(listeningHttpUrl("[::1]:5175", 5175)).toBe("http://localhost:5175");
        expect(listeningHttpUrl("*:54321", 54321)).toBe("http://localhost:54321");
        expect(listeningHttpUrl("0.0.0.0:3000", 3000)).toBe("http://localhost:3000");
        expect(listeningHttpUrl("127.0.0.53%lo:53", 53)).toBe("http://localhost:53");
    });

    it("keeps other bind addresses", () => {
        expect(listeningHttpUrl("192.168.1.2:8080", 8080)).toBe("http://192.168.1.2:8080");
    });
});
