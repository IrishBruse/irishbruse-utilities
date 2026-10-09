import { describe, expect, it } from "vitest";
import {
    completeSkillPropertyKeys,
    emptyProperty,
    parseSkillFrontMatter,
    serializeSkillFrontMatter,
    skillFrontMatterValueContent,
    widgetForKey,
} from "./skillFrontMatterYaml";

describe("widgetForKey", () => {
    it("picks a widget from the key", () => {
        expect(widgetForKey("description")).toBe("multiline");
        expect(widgetForKey("disable-model-invocation")).toBe("boolean");
        expect(widgetForKey("user-invocable")).toBe("boolean");
        expect(widgetForKey("metadata")).toBe("map");
        expect(widgetForKey("name")).toBe("text");
        expect(widgetForKey("license")).toBe("text");
        expect(widgetForKey("unknown")).toBe("text");
    });
});

describe("emptyProperty", () => {
    it("builds an empty property for each widget", () => {
        expect(emptyProperty("disable-model-invocation")).toEqual({
            key: "disable-model-invocation",
            kind: "boolean",
            value: true,
        });
        expect(emptyProperty("metadata")).toEqual({ key: "metadata", kind: "map", entries: [] });
        expect(emptyProperty("description")).toEqual({ key: "description", kind: "string", value: "" });
        expect(emptyProperty("name")).toEqual({ key: "name", kind: "string", value: "" });
    });
});

describe("completeSkillPropertyKeys", () => {
    it("filters used keys and matches a case-insensitive prefix", () => {
        expect(completeSkillPropertyKeys(["name"], "")).toEqual([
            "description",
            "license",
            "compatibility",
            "metadata",
            "allowed-tools",
            "disable-model-invocation",
            "user-invocable",
        ]);
        expect(completeSkillPropertyKeys([], "Meta")).toEqual(["metadata"]);
        expect(completeSkillPropertyKeys(["metadata"], "meta")).toEqual([]);
        expect(completeSkillPropertyKeys([], "zzz")).toEqual([]);
    });
});

describe("parseSkillFrontMatter", () => {
    it("skips blanks, comments, and lines that are not keys", () => {
        expect(parseSkillFrontMatter("")).toEqual([]);
        expect(parseSkillFrontMatter("# comment\n\nname: plain\n")).toEqual([
            { key: "name", kind: "string", value: "plain" },
        ]);
        expect(parseSkillFrontMatter("- not a key\nname: plain\n")).toEqual([
            { key: "name", kind: "string", value: "plain" },
        ]);
        expect(parseSkillFrontMatter("name: value\n\nnot-a-key\n")).toEqual([
            { key: "name", kind: "string", value: "value" },
        ]);
        expect(parseSkillFrontMatter("name: value\n\n")).toEqual([
            { key: "name", kind: "string", value: "value" },
        ]);
        expect(parseSkillFrontMatter("name: a\r\nlicense: MIT\r\n")).toEqual([
            { key: "name", kind: "string", value: "a" },
            { key: "license", kind: "string", value: "MIT" },
        ]);
        expect(parseSkillFrontMatter("name: a\rlicense: MIT\r")).toEqual([
            { key: "name", kind: "string", value: "a" },
            { key: "license", kind: "string", value: "MIT" },
        ]);
    });

    it("unquotes scalars and reads booleans", () => {
        expect(parseSkillFrontMatter('name: "say \\"hi\\"\\nnext"\n')).toEqual([
            { key: "name", kind: "string", value: "say \"hi\"\nnext" },
        ]);
        expect(parseSkillFrontMatter("name: 'it''s'\n")).toEqual([
            { key: "name", kind: "string", value: "it's" },
        ]);
        expect(parseSkillFrontMatter('name: ""\n')).toEqual([
            { key: "name", kind: "string", value: "" },
        ]);
        expect(parseSkillFrontMatter("name: ''\n")).toEqual([
            { key: "name", kind: "string", value: "" },
        ]);
        expect(parseSkillFrontMatter('name: "nope\n')).toEqual([
            { key: "name", kind: "string", value: "\"nope" },
        ]);
        expect(parseSkillFrontMatter("name: '\n")).toEqual([
            { key: "name", kind: "string", value: "'" },
        ]);
        expect(parseSkillFrontMatter('name: "\n')).toEqual([
            { key: "name", kind: "string", value: "\"" },
        ]);
        expect(parseSkillFrontMatter("name: plain\n")).toEqual([
            { key: "name", kind: "string", value: "plain" },
        ]);

        for (const [raw, value] of [
            ["true", true],
            ["yes", true],
            ["on", true],
            ["false", false],
            ["no", false],
            ["off", false],
            ["maybe", false],
        ] as const) {
            expect(parseSkillFrontMatter(`disable-model-invocation: ${raw}\n`)).toEqual([
                { key: "disable-model-invocation", kind: "boolean", value },
            ]);
        }
    });

    it("reads maps, including an empty map and a map that stops early", () => {
        expect(parseSkillFrontMatter("metadata: {}\n")).toEqual([
            { key: "metadata", kind: "map", entries: [] },
        ]);
        expect(parseSkillFrontMatter("metadata: hello\n")).toEqual([
            { key: "metadata", kind: "string", value: "hello" },
        ]);
        expect(parseSkillFrontMatter("custom: {}\n")).toEqual([
            { key: "custom", kind: "map", entries: [] },
        ]);
        expect(parseSkillFrontMatter("metadata:\n  alpha: beta\n  blank: \"\"\n\nlicense: MIT\n")).toEqual([
            {
                key: "metadata",
                kind: "map",
                entries: [
                    { key: "alpha", value: "beta" },
                    { key: "blank", value: "" },
                ],
            },
            { key: "license", kind: "string", value: "MIT" },
        ]);
        expect(parseSkillFrontMatter("custom:\n  alpha: beta\nname: x\n")).toEqual([
            { key: "custom", kind: "map", entries: [{ key: "alpha", value: "beta" }] },
            { key: "name", kind: "string", value: "x" },
        ]);
        expect(parseSkillFrontMatter("metadata:\n  alpha: beta\n  not-entry\nname: x\n")).toEqual([
            { key: "metadata", kind: "map", entries: [{ key: "alpha", value: "beta" }] },
            { key: "name", kind: "string", value: "x" },
        ]);
        expect(parseSkillFrontMatter("metadata:\n  quote: 'it''s'\n")).toEqual([
            { key: "metadata", kind: "map", entries: [{ key: "quote", value: "it's" }] },
        ]);
        const common = "metadata:\n  author: example-org\n  version: \"1.0\"\n";
        expect(serializeSkillFrontMatter(parseSkillFrontMatter(common))).toBe(common);
    });

    it("reads literal and folded block scalars with each chomp", () => {
        expect(parseSkillFrontMatter("metadata: |\n  row\n")).toEqual([
            { key: "metadata", kind: "string", value: "row\n" },
        ]);
        expect(parseSkillFrontMatter("body: |\n  one\n  two\n")).toEqual([
            { key: "body", kind: "string", value: "one\ntwo\n" },
        ]);
        expect(parseSkillFrontMatter("body: |-\n  one\n  two\n")).toEqual([
            { key: "body", kind: "string", value: "one\ntwo" },
        ]);
        expect(parseSkillFrontMatter("body: |+\n  one\n\n")).toEqual([
            { key: "body", kind: "string", value: "one\n\n" },
        ]);
        expect(parseSkillFrontMatter("body: >\n  alpha\n  beta\n\n  gamma\n")).toEqual([
            { key: "body", kind: "string", value: "alpha beta\ngamma\n" },
        ]);
        expect(parseSkillFrontMatter("body: >-\n  alpha\n  beta\n\n  gamma\n")).toEqual([
            { key: "body", kind: "string", value: "alpha beta\ngamma" },
        ]);
        expect(parseSkillFrontMatter("body: >+\n  alpha\n\n")).toEqual([
            { key: "body", kind: "string", value: "alpha" },
        ]);
        expect(parseSkillFrontMatter("body: |\nname: a\n")).toEqual([
            { key: "body", kind: "string", value: "" },
            { key: "name", kind: "string", value: "a" },
        ]);
        expect(parseSkillFrontMatter("body: |\n\nname: a\n")).toEqual([
            { key: "body", kind: "string", value: "\n" },
            { key: "name", kind: "string", value: "a" },
        ]);
        expect(parseSkillFrontMatter("body: |\n    four\n  two\n")).toEqual([
            { key: "body", kind: "string", value: "  four\ntwo\n" },
        ]);
        expect(parseSkillFrontMatter("body: >\n\n  alpha\n")).toEqual([
            { key: "body", kind: "string", value: "alpha\n" },
        ]);
        expect(parseSkillFrontMatter("body: |\n\n  alpha\n")).toEqual([
            { key: "body", kind: "string", value: "\nalpha\n" },
        ]);
    });
});

describe("serializeSkillFrontMatter", () => {
    it("writes booleans, maps, and inline strings", () => {
        expect(serializeSkillFrontMatter([])).toBe("");
        expect(serializeSkillFrontMatter([
            { key: "disable-model-invocation", kind: "boolean", value: true },
            { key: "flag", kind: "boolean", value: false },
        ])).toBe("disable-model-invocation: true\nflag: false\n");
        expect(serializeSkillFrontMatter([
            { key: "metadata", kind: "map", entries: [] },
        ])).toBe("metadata: {}\n");
        expect(serializeSkillFrontMatter([
            { key: "license", kind: "string", value: "" },
        ])).toBe("license: \"\"\n");
        expect(serializeSkillFrontMatter([
            { key: "license", kind: "string", value: "a:b" },
        ])).toBe("license: \"a:b\"\n");
        expect(serializeSkillFrontMatter([
            { key: "description", kind: "string", value: "short" },
        ])).toBe("description: short\n");
        expect(serializeSkillFrontMatter([
            { key: "name", kind: "string", value: "n".repeat(90) },
        ])).toBe(`name: ${"n".repeat(90)}\n`);

        const yaml = serializeSkillFrontMatter([
            {
                key: "metadata",
                kind: "map",
                entries: [
                    { key: "", value: "skip" },
                    { key: "plain", value: "hello" },
                    { key: "empty", value: "" },
                    { key: "flag", value: "true" },
                    { key: "yes", value: "YES" },
                    { key: "note", value: "a:b" },
                    { key: "pad", value: " hello" },
                    { key: "tail", value: "hello " },
                    { key: "multi", value: "a\nb" },
                    { key: "quote", value: "say \"hi\"" },
                    { key: "slash", value: "a\\b" },
                ],
            },
        ]);
        expect(yaml).toContain("plain: hello\n");
        expect(yaml).toContain("empty: \"\"\n");
        expect(yaml).toContain("flag: \"true\"\n");
        expect(yaml).toContain("yes: \"YES\"\n");
        expect(yaml).toContain("note: \"a:b\"\n");
        expect(yaml).toContain("pad: \" hello\"\n");
        expect(yaml).toContain("tail: \"hello \"\n");
        expect(yaml).toContain("multi: \"a\\nb\"\n");
        expect(yaml).toContain("quote: \"say \\\"hi\\\"\"\n");
        expect(yaml).toContain("slash: a\\b\n");
        expect(yaml).not.toContain("skip");
    });

    it("folds long descriptions and preserves newlines as literal blocks", () => {
        expect(serializeSkillFrontMatter([
            { key: "license", kind: "string", value: "line1\nline2" },
        ])).toBe("license: |\n  line1\n  line2\n");

        const long = "alpha ".repeat(20).trim();
        const folded = serializeSkillFrontMatter([
            { key: "description", kind: "string", value: long },
        ]);
        expect(folded.startsWith("description: >-\n")).toBe(true);
        expect(parseSkillFrontMatter(folded)).toEqual([
            { key: "description", kind: "string", value: long },
        ]);

        const wrapped = `${"x".repeat(90)} tiny`;
        const wrappedYaml = serializeSkillFrontMatter([
            { key: "description", kind: "string", value: wrapped },
        ]);
        expect(wrappedYaml.startsWith("description: >-\n")).toBe(true);
        expect(parseSkillFrontMatter(wrappedYaml)).toEqual([
            { key: "description", kind: "string", value: wrapped },
        ]);

        expect(serializeSkillFrontMatter([
            { key: "description", kind: "string", value: " ".repeat(81) },
        ])).toBe("description: >-\n  \n");
    });
});

describe("skillFrontMatterValueContent", () => {
    it("keeps a leading break from the previous content", () => {
        expect(skillFrontMatterValueContent("name: a\n", "body")).toBe("\nname: a\n");
        expect(skillFrontMatterValueContent("name: a\n", "")).toBe("\nname: a\n");
        expect(skillFrontMatterValueContent("name: a\n", "\n\nbody")).toBe("\n\nname: a\n");
        expect(skillFrontMatterValueContent("name: a\n", "\r\nbody")).toBe("\r\nname: a\n");
    });
});
