export const FAST_OPEN_MAX_CHARS = 64 * 1024;

export interface MarkdownEditorInitialState {
    readonly content: string;
    readonly documentVersion: number;
    readonly readonly: boolean;
    readonly richLinksEnabled: boolean;
    readonly linkPresentationRules: readonly {
        id: string;
        source: string;
        flags: string;
        kind: string;
    }[];
    readonly tables: {
        readonly maxColumnWidth: number;
        readonly style: "wrapped" | "compact";
    };
    readonly skillFrontMatter: boolean;
    readonly skillFolderName: string;
}

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

export function encodeWebviewInitialState(state: MarkdownEditorInitialState): string {
    return encodeURIComponent(JSON.stringify(state));
}

/** First source slice for a fast first paint. The host sends the rest after `ready`. */
export function prefixMarkdownForFastOpen(text: string, maxChars = FAST_OPEN_MAX_CHARS): string {
    if (text.length <= maxChars) {
        return text;
    }
    const cut = text.lastIndexOf("\n", maxChars);
    const end = cut >= Math.floor(maxChars / 2) ? cut + 1 : maxChars;
    return text.slice(0, end);
}
