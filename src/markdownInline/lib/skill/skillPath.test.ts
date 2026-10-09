import { describe, expect, it } from "vitest";
import { isSkillMarkdownPath, skillDirectoryName } from "./skillPath";

describe("skillDirectoryName", () => {
    it("reads the parent folder of SKILL.md", () => {
        expect(skillDirectoryName("https://example.com/skills/pdf-processing/SKILL.md")).toBe("pdf-processing");
        expect(skillDirectoryName("file:///tmp/demo/SKILL.md")).toBe("demo");
        expect(skillDirectoryName("https://example.com/readme.md")).toBeUndefined();
        expect(skillDirectoryName("SKILL.md")).toBeUndefined();
    });
});

describe("isSkillMarkdownPath", () => {
    it("is true only when the file name is SKILL.md", () => {
        expect(isSkillMarkdownPath("SKILL.md")).toBe(true);
        expect(isSkillMarkdownPath("skills/demo/SKILL.md")).toBe(true);
        expect(isSkillMarkdownPath("skills\\demo\\SKILL.md")).toBe(true);
        expect(isSkillMarkdownPath("skills/demo/skill.md")).toBe(false);
        expect(isSkillMarkdownPath("skills/demo/SKILL.md.bak")).toBe(false);
        expect(isSkillMarkdownPath("skills/demo/")).toBe(false);
        expect(isSkillMarkdownPath("")).toBe(false);
    });

    it("treats a missing file name as not a skill file", () => {
        const pop = Array.prototype.pop;
        Array.prototype.pop = (() => undefined) as typeof Array.prototype.pop;
        try {
            expect(isSkillMarkdownPath("skills/SKILL.md")).toBe(false);
        } finally {
            Array.prototype.pop = pop;
        }
    });
});
