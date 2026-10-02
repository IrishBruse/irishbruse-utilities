import { describe, expect, it } from "vitest";
import { paintYamlFrontMatter } from "./skillYaml";

const source = `---
name: markdown-skill-fixture
description: >-
  Manual fixture
disable-model-invocation: true
license: MIT
---
`;

function text(className: string): string {
    return paintYamlFrontMatter(source, 0, source.length)
        .filter((paint) => paint.className === className)
        .map((paint) => source.slice(paint.start, paint.end))
        .join("|");
}

describe("paintYamlFrontMatter", () => {
    it("colors keys, strings, booleans, and fences", () => {
        expect(text("inline-md-yaml-key")).toBe("name|description|disable-model-invocation|license");
        expect(text("inline-md-yaml-string")).toContain("markdown-skill-fixture");
        expect(text("inline-md-yaml-string")).toContain("Manual fixture");
        expect(text("inline-md-yaml-boolean")).toBe("true");
        expect(text("inline-md-yaml-operator")).toContain("---");
        expect(text("inline-md-yaml-operator")).toContain(">-");
    });
});
