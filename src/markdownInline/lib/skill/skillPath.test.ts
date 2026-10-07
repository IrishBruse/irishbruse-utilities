import { describe, expect, it } from "vitest";
import { isSkillMarkdownPath } from "./skillPath";

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
