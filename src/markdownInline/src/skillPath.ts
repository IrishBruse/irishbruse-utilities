export function isSkillMarkdownPath(path: string): boolean {
    const file = path.split(/[/\\]/).pop() ?? "";
    return file === "SKILL.md";
}
