import { describe, expect, it } from "vitest";
import { agentPropertyCompletions, completeAgentPropertyKeys, skillPropertyInsertText } from "./skillKeys";

describe("completeAgentPropertyKeys", () => {
    it("adds general agent properties after the skill keys", () => {
        expect(completeAgentPropertyKeys(["name", "description"], "")).toEqual([
            "license",
            "compatibility",
            "metadata",
            "allowed-tools",
            "disable-model-invocation",
            "user-invocable",
        ]);
        expect(completeAgentPropertyKeys([], "c")).toEqual(["compatibility"]);
        expect(completeAgentPropertyKeys(["compatibility"], "c")).toEqual([]);
        expect(completeAgentPropertyKeys([], "p")).toEqual([]);
        expect(completeAgentPropertyKeys([], "")).not.toContain("paths");
        expect(completeAgentPropertyKeys([], "")).not.toContain("icon");
        expect(completeAgentPropertyKeys([], "")).not.toContain("color");
    });
});

describe("skillPropertyInsertText", () => {
    it("writes the boolean and the metadata map", () => {
        expect(skillPropertyInsertText("disable-model-invocation", false)).toBe("disable-model-invocation: true");
        expect(skillPropertyInsertText("metadata", false)).toBe("metadata:\n  author: example-org\n  version: \"1.0\"");
        expect(skillPropertyInsertText("name", false)).toBe("name: ");
        expect(skillPropertyInsertText("disable-model-invocation", true)).toBe("disable-model-invocation");
    });
});

describe("agentPropertyCompletions", () => {
    it("suggests keys only before the colon", () => {
        expect(agentPropertyCompletions(["name"], "dis")).toEqual(["disable-model-invocation"]);
        expect(agentPropertyCompletions(["name"], "name: mark")).toBeUndefined();
        expect(agentPropertyCompletions(["name"], "  ")).toBeUndefined();
    });
});
