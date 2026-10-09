export const FAST_OPEN_MAX_CHARS = 64 * 1024;

export function isSkillMarkdownPath(path: string): boolean {
    const file = path.split(/[/\\]/).pop() ?? "";
    return file === "SKILL.md";
}

export function skillFolderNameFromPath(path: string): string {
    const parts = path.split(/[/\\]/).filter((part) => part.length > 0);
    if (parts.length < 2) {
        return "";
    }
    return parts[parts.length - 2] ?? "";
}

export function prefixMarkdownForFastOpen(text: string, maxChars = FAST_OPEN_MAX_CHARS): string {
    if (text.length <= maxChars) {
        return text;
    }
    const cut = text.lastIndexOf("\n", maxChars);
    const end = cut >= Math.floor(maxChars / 2) ? cut + 1 : maxChars;
    return text.slice(0, end);
}
