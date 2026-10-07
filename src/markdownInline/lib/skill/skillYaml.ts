export interface YamlPaint {
    readonly start: number;
    readonly end: number;
    readonly className: string;
}

const KEYWORDS = new Set(["true", "false", "yes", "no", "on", "off", "null"]);

function paint(paints: YamlPaint[], start: number, end: number, className: string): void {
    if (end > start) {
        paints.push({ start, end, className });
    }
}

function paintValue(paints: YamlPaint[], valueStart: number, value: string): void {
    const commentAt = value.search(/(?:^|\s)#/);
    const code = commentAt === -1 ? value : value.slice(0, commentAt);
    const trimmed = code.trim();
    if (trimmed.length > 0) {
        const at = code.indexOf(trimmed);
        const start = valueStart + at;
        if (KEYWORDS.has(trimmed)) {
            paint(paints, start, start + trimmed.length, "inline-md-yaml-boolean");
        } else if (/^[+-]?(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?$/.test(trimmed)) {
            paint(paints, start, start + trimmed.length, "inline-md-yaml-number");
        } else if (/^[>|][+-]?$/.test(trimmed)) {
            paint(paints, start, start + trimmed.length, "inline-md-yaml-operator");
        } else {
            paint(paints, start, start + trimmed.length, "inline-md-yaml-string");
        }
    }
    if (commentAt !== -1) {
        const hash = value.indexOf("#", commentAt);
        if (hash !== -1) {
            paint(paints, valueStart + hash, valueStart + value.length, "inline-md-yaml-comment");
        }
    }
}

export function paintYamlFrontMatter(text: string, from: number, to: number): YamlPaint[] {
    const paints: YamlPaint[] = [];
    let index = from;
    let blockIndent = -1;
    while (index < to) {
        const breakAt = text.indexOf("\n", index);
        const lineEnd = breakAt === -1 || breakAt >= to ? to : breakAt;
        const raw = text.slice(index, lineEnd);
        const line = raw.endsWith("\r") ? raw.slice(0, -1) : raw;
        const contentEnd = index + line.length;
        const trimmed = line.trim();
        if (blockIndent >= 0) {
            const indent = /^ */.exec(line)?.[0].length ?? 0;
            if (trimmed.length > 0 && indent <= blockIndent) {
                blockIndent = -1;
            } else {
                paint(paints, index, contentEnd, "inline-md-yaml-string");
                index = lineEnd < to && text[lineEnd] === "\n" ? lineEnd + 1 : lineEnd;
                continue;
            }
        }
        if (trimmed === "---" || trimmed === "...") {
            const dash = line.indexOf(trimmed);
            paint(paints, index + dash, index + dash + trimmed.length, "inline-md-yaml-operator");
        } else if (trimmed.startsWith("#")) {
            const hash = line.indexOf("#");
            paint(paints, index + hash, contentEnd, "inline-md-yaml-comment");
        } else {
            const match = /^(\s*)([^:#\s][^:#]*?)(\s*)(:)(\s*)(.*)$/.exec(line);
            if (match) {
                const indent = match[1] ?? "";
                const key = match[2] ?? "";
                const colonSpaces = match[3] ?? "";
                const afterColon = match[5] ?? "";
                const value = match[6] ?? "";
                const keyStart = index + indent.length;
                paint(paints, keyStart, keyStart + key.length, "inline-md-yaml-key");
                const colonAt = keyStart + key.length + colonSpaces.length;
                paint(paints, colonAt, colonAt + 1, "inline-md-yaml-operator");
                paintValue(paints, colonAt + 1 + afterColon.length, value);
                if (/^[>|][+-]?$/.test(value.trim())) {
                    blockIndent = indent.length;
                }
            }
        }
        index = lineEnd < to && text[lineEnd] === "\n" ? lineEnd + 1 : lineEnd;
    }
    return paints;
}

export const skillMarkdownLanguageId = "skill-markdown";
