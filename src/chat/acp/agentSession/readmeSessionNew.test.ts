import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { parseSessionModelsFromReadmeNdjson } from "./readmeSessionNew";

const agentSessionDir = dirname(fileURLToPath(import.meta.url));
const readmePath = join(agentSessionDir, "..", "..", "..", "..", "webview/ib-chat-standalone/mock/readme.ndjson");

describe("parseSessionModelsFromReadmeNdjson", () => {
    it("reads models from mock readme fixture", () => {
        const text = readFileSync(readmePath, "utf-8");
        const parsed = parseSessionModelsFromReadmeNdjson(text);
        expect(parsed).not.toBeNull();
        expect(parsed?.currentModelId).toBe("composer-2[fast=true]");
        expect(parsed?.availableModels.length).toBeGreaterThan(3);
        expect(parsed?.availableModels[0]).toEqual({ modelId: "default[]", name: "Auto" });
    });
});
