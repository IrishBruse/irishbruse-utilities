import { describe, expect, it } from "vitest";
import { isPotentiallyExtensionPostMessageData, tryParseWebviewMessage } from "./ibChatProtocol";

describe("ibChatProtocol", () => {
    describe("isPotentiallyExtensionPostMessageData", () => {
        it("accepts plain objects and arrays", () => {
            expect(isPotentiallyExtensionPostMessageData({ type: "init" })).toBe(true);
            expect(isPotentiallyExtensionPostMessageData({})).toBe(true);
            expect(isPotentiallyExtensionPostMessageData({ type: 1 })).toBe(true);
            expect(isPotentiallyExtensionPostMessageData([])).toBe(true);
        });
        it("rejects null, undefined, and primitives", () => {
            expect(isPotentiallyExtensionPostMessageData(null)).toBe(false);
            expect(isPotentiallyExtensionPostMessageData(undefined)).toBe(false);
            expect(isPotentiallyExtensionPostMessageData("x")).toBe(false);
        });
    });

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
            expect(tryParseWebviewMessage({ type: "setSessionModel", modelId: "gpt-5[]" })).toEqual({
                type: "setSessionModel",
                modelId: "gpt-5[]",
            });
            expect(tryParseWebviewMessage({ type: "setSessionModel", modelId: "" })).toBeNull();
        });

        it("returns permissionResponse with selectedOptionId", () => {
            expect(
                tryParseWebviewMessage({
                    type: "permissionResponse",
                    requestId: "perm-0",
                    selectedOptionId: "allow",
                })
            ).toEqual({
                type: "permissionResponse",
                requestId: "perm-0",
                selectedOptionId: "allow",
            });
        });

        it("returns permissionResponse with cancelled", () => {
            expect(
                tryParseWebviewMessage({
                    type: "permissionResponse",
                    requestId: "perm-1",
                    cancelled: true,
                })
            ).toEqual({
                type: "permissionResponse",
                requestId: "perm-1",
                cancelled: true,
            });
        });

        it("returns null for permissionResponse without selection or cancel", () => {
            expect(tryParseWebviewMessage({ type: "permissionResponse", requestId: "x" })).toBeNull();
        });

        it("returns savePromptHistory with string entries", () => {
            expect(
                tryParseWebviewMessage({ type: "savePromptHistory", entries: ["a", "b"] })
            ).toEqual({ type: "savePromptHistory", entries: ["a", "b"] });
        });

        it("returns null for savePromptHistory when entries is not an array", () => {
            expect(tryParseWebviewMessage({ type: "savePromptHistory", entries: "x" })).toBeNull();
        });
    });
});
