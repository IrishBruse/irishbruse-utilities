import { describe, expect, it } from "vitest";
import { parseAcpAgentSpawnConfig } from "./acpAgentSpawnConfig";

describe("parseAcpAgentSpawnConfig", () => {
    it("accepts command name and args", () => {
        expect(
            parseAcpAgentSpawnConfig({
                name: "Gemini",
                command: "gemini",
                args: ["--stdio"],
            })
        ).toEqual({ name: "Gemini", command: "gemini", args: ["--stdio"] });
    });

    it("defaults args to empty when omitted", () => {
        expect(parseAcpAgentSpawnConfig({ name: "x", command: "y" })).toEqual({
            name: "x",
            command: "y",
            args: [],
        });
    });

    it("filters non-string args", () => {
        expect(
            parseAcpAgentSpawnConfig({
                name: "x",
                command: "y",
                args: ["a", 1, "b"],
            })
        ).toEqual({ name: "x", command: "y", args: ["a", "b"] });
    });

    it("parses env with string values only", () => {
        expect(
            parseAcpAgentSpawnConfig({
                name: "x",
                command: "y",
                env: { FOO: "bar", SKIP: 1 },
            })
        ).toEqual({ name: "x", command: "y", args: [], env: { FOO: "bar" } });
    });

    it("rejects invalid entries", () => {
        expect(parseAcpAgentSpawnConfig(null)).toBeUndefined();
        expect(parseAcpAgentSpawnConfig({ name: "x" })).toBeUndefined();
        expect(parseAcpAgentSpawnConfig({ command: "y" })).toBeUndefined();
    });
});
