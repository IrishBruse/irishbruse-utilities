import { describe, expect, it } from "vitest";
import { tryParseWebviewMessage } from "./ibChatProtocol";

describe("ibChatProtocol", () => {
    describe("tryParseWebviewMessage", () => {
        it("returns ready for a ready payload", () => {
            expect(tryParseWebviewMessage({ type: "ready" })).toEqual({ type: "ready" });
        });

        it("returns send when body is a string", () => {
            expect(tryParseWebviewMessage({ type: "send", body: "hello" })).toEqual({
                type: "send",
                body: "hello",
            });
        });

        it("returns null for send when body is not a string", () => {
            expect(tryParseWebviewMessage({ type: "send", body: 1 })).toBeNull();
        });

        it("returns null for unknown type", () => {
            expect(tryParseWebviewMessage({ type: "other" })).toBeNull();
        });

        it("returns null for non-objects", () => {
            expect(tryParseWebviewMessage(null)).toBeNull();
            expect(tryParseWebviewMessage("x")).toBeNull();
        });

        it("returns cancel for a cancel payload", () => {
            expect(tryParseWebviewMessage({ type: "cancel" })).toEqual({ type: "cancel" });
        });
    });
});
