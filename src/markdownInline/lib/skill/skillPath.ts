export function isSkillMarkdownPath(path: string): boolean {
    const file = path.split(/[/\\]/).pop() ?? "";
    return file === "SKILL.md";
}

export function skillDirectoryName(documentUrl: string): string | undefined {
    let path = documentUrl;
    try {
        path = decodeURIComponent(new URL(documentUrl).pathname);
    } catch {
        path = documentUrl.split("?")[0] ?? documentUrl;
    }
    const parts = path.split(/[/\\]/).filter((part) => part.length > 0);
    if (parts.at(-1) !== "SKILL.md") {
        return undefined;
    }
    return parts.at(-2);
}
