import { describe, expect, it } from "vitest";
import { agentPropertyCompletions, completeAgentPropertyKeys } from "./skillKeys";

describe("completeAgentPropertyKeys", () => {
    it("adds general agent properties after the skill keys", () => {
        expect(completeAgentPropertyKeys(["name", "description"], "")).toEqual([
            "disable-model-invocation",
            "license",
            "compatibility",
            "allowed-tools",
            "metadata",
            "paths",
            "icon",
            "color",
        ]);
        expect(completeAgentPropertyKeys([], "c")).toEqual(["compatibility", "color"]);
        expect(completeAgentPropertyKeys(["color"], "c")).toEqual(["compatibility"]);
        expect(completeAgentPropertyKeys([], "p")).toEqual(["paths"]);
    });
});

describe("agentPropertyCompletions", () => {
    it("suggests keys only before the colon", () => {
        expect(agentPropertyCompletions(["name"], "dis")).toEqual(["disable-model-invocation"]);
        expect(agentPropertyCompletions(["name"], "name: mark")).toBeUndefined();
        expect(agentPropertyCompletions(["name"], "  ")).toBeUndefined();
    });
});
