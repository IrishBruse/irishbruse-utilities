import { describe, expect, it } from "vitest";
import { skillFrontMatterIssues } from "./skillFrontMatterIssues";

function messages(yaml: string, directoryName?: string): string[] {
    return skillFrontMatterIssues(yaml, directoryName).map((issue) => issue.message);
}

describe("skillFrontMatterIssues", () => {
    it("accepts a spec example", () => {
        const yaml = [
            "name: pdf-processing",
            "description: Extract PDF text, fill forms, merge files. Use when handling PDFs.",
            "license: Apache-2.0",
            "metadata:",
            "  author: example-org",
            "  version: \"1.0\"",
            "allowed-tools: Bash(git:*) Read",
            "disable-model-invocation: true",
            "user-invocable: false",
            "",
        ].join("\n");
        expect(messages(yaml, "pdf-processing")).toEqual([]);
    });

    it("requires name and description", () => {
        expect(messages("license: MIT\n", "demo")).toEqual([
            "name is required.",
            "description is required.",
        ]);
        const issues = skillFrontMatterIssues("license: MIT\n", "demo");
        expect(issues.every((issue) => issue.start < 0)).toBe(true);
    });

    it("checks the name rules", () => {
        const description = "description: Does the task when asked.\n";
        expect(messages(`name: PDF\n${description}`, "PDF")).toEqual([
            "name must use lowercase letters, numbers, and hyphens.",
        ]);
        expect(messages(`name: -pdf\n${description}`, "-pdf")).toEqual([
            "name must not start or end with a hyphen.",
        ]);
        expect(messages(`name: pdf-\n${description}`, "pdf-")).toEqual([
            "name must not start or end with a hyphen.",
        ]);
        expect(messages(`name: pdf--tool\n${description}`, "pdf--tool")).toEqual([
            "name must not contain consecutive hyphens.",
        ]);
        expect(messages(`name: ${"a".repeat(65)}\n${description}`, "a".repeat(65))).toEqual([
            "name must be at most 64 characters.",
        ]);
        expect(messages(`name:\n${description}`, "demo")).toEqual([
            "name must be 1 to 64 characters.",
        ]);
        expect(messages(`name: other-skill\n${description}`, "demo")).toEqual([
            "name must match the parent directory name.",
        ]);
        expect(messages(`name: other-skill\n${description}`)).toEqual([]);
    });

    it("checks description, compatibility, metadata, and allowed-tools", () => {
        expect(messages("name: demo\ndescription:\n", "demo")).toEqual([
            "description must be 1 to 1024 characters.",
        ]);
        expect(messages(`name: demo\ndescription: ${"a".repeat(1025)}\n`, "demo")).toEqual([
            "description must be at most 1024 characters.",
        ]);
        expect(messages("name: demo\ndescription: Ready.\ncompatibility:\n", "demo")).toEqual([
            "compatibility must be 1 to 500 characters.",
        ]);
        expect(messages(`name: demo\ndescription: Ready.\ncompatibility: ${"a".repeat(501)}\n`, "demo")).toEqual([
            "compatibility must be at most 500 characters.",
        ]);
        expect(messages("name: demo\ndescription: Ready.\nmetadata: hello\n", "demo")).toEqual([
            "metadata must be a map from string keys to string values.",
        ]);
        expect(messages("name: demo\ndescription: Ready.\nallowed-tools:\n  - Read\n", "demo")).toEqual([
            "allowed-tools must be a space-separated string.",
        ]);
        expect(messages("name: demo\ndescription: Ready.\nicon: bolt\n", "demo")).toEqual([
            "Unexpected field 'icon'. The spec allows name, description, license, compatibility, metadata, and allowed-tools.",
        ]);
    });
});
