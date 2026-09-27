export type MarkdownSourceKind = "heading" | "bold" | "italic" | "code" | "linkLabel" | "link";

export interface MarkdownSourceToken {
    readonly start: number;
    readonly endExclusive: number;
    readonly kind: MarkdownSourceKind;
}

interface Fence {
    readonly char: "`" | "~";
    readonly length: number;
}

/** Lightweight markdown coloring for the raw source pane. Offsets match the source string. */
export function highlightMarkdownSource(text: string): MarkdownSourceToken[] {
    const tokens: MarkdownSourceToken[] = [];
    let offset = 0;
    let fence: Fence | undefined;
    while (offset < text.length) {
        const newline = text.indexOf("\n", offset);
        const lineEnd = newline === -1 ? text.length : newline;
        const line = text.slice(offset, lineEnd);
        if (fence) {
            tokens.push({ start: offset, endExclusive: lineEnd, kind: "code" });
            if (isClosingFence(line, fence)) {
                fence = undefined;
            }
        } else {
            const opened = openingFence(line);
            if (opened) {
                tokens.push({ start: offset, endExclusive: lineEnd, kind: "code" });
                fence = opened;
            } else if (isHeading(line)) {
                const hashes = line.indexOf("#");
                tokens.push({ start: offset + hashes, endExclusive: lineEnd, kind: "heading" });
                highlightInline(text, offset, lineEnd, tokens);
            } else {
                const definition = linkDefinition(line);
                if (definition) {
                    tokens.push({ start: offset + definition.labelStart, endExclusive: offset + definition.labelEnd, kind: "linkLabel" });
                    tokens.push({ start: offset + definition.urlStart, endExclusive: offset + definition.urlEnd, kind: "link" });
                    highlightInline(text, offset + definition.urlEnd, lineEnd, tokens);
                } else {
                    highlightInline(text, offset, lineEnd, tokens);
                }
            }
        }
        if (newline === -1) {
            break;
        }
        offset = newline + 1;
    }
    return tokens;
}

export function lineNumberText(text: string): string {
    const count = text.length === 0 ? 1 : text.split("\n").length;
    let numbers = "";
    for (let line = 1; line <= count; line++) {
        numbers += line === count ? String(line) : `${line}\n`;
    }
    return numbers;
}

function isHeading(line: string): boolean {
    return /^ {0,3}#{1,6}(?:[ \t]|$)/.test(line);
}

function openingFence(line: string): Fence | undefined {
    const match = /^(?: {0,3})(`{3,}|~{3,})(.*)$/.exec(line);
    if (!match) {
        return undefined;
    }
    const marker = match[1] ?? "";
    const rest = match[2] ?? "";
    if (marker.startsWith("`") && rest.includes("`")) {
        return undefined;
    }
    return { char: marker.startsWith("~") ? "~" : "`", length: marker.length };
}

function isClosingFence(line: string, fence: Fence): boolean {
    const match = /^(?: {0,3})(`{3,}|~{3,})[ \t]*$/.exec(line);
    const marker = match?.[1];
    return marker !== undefined && marker.startsWith(fence.char) && marker.length >= fence.length;
}

interface LinkDefinition {
    readonly labelStart: number;
    readonly labelEnd: number;
    readonly urlStart: number;
    readonly urlEnd: number;
}

function linkDefinition(line: string): LinkDefinition | undefined {
    const match = /^( {0,3}\[[^\]]+\]:[ \t]+)(\S+)/.exec(line);
    if (!match) {
        return undefined;
    }
    const prefix = match[1] ?? "";
    const url = match[2] ?? "";
    return {
        labelStart: prefix.indexOf("["),
        labelEnd: prefix.indexOf("]") + 1,
        urlStart: prefix.length,
        urlEnd: prefix.length + url.length,
    };
}

function highlightInline(text: string, start: number, end: number, tokens: MarkdownSourceToken[]): void {
    let index = start;
    while (index < end) {
        if (text[index] === "`") {
            const close = text.indexOf("`", index + 1);
            if (close !== -1 && close < end) {
                tokens.push({ start: index, endExclusive: close + 1, kind: "code" });
                index = close + 1;
                continue;
            }
        }
        if (text.startsWith("**", index) || text.startsWith("__", index)) {
            const marker = text.slice(index, index + 2);
            const close = text.indexOf(marker, index + 2);
            if (close !== -1 && close < end) {
                tokens.push({ start: index, endExclusive: close + 2, kind: "bold" });
                index = close + 2;
                continue;
            }
        }
        if ((text[index] === "*" || text[index] === "_") && text[index + 1] !== text[index]) {
            const marker = text[index] ?? "*";
            const close = text.indexOf(marker, index + 1);
            const underscoreInsideWord = marker === "_" && (isWordChar(text[index - 1]) || isWordChar(text[close + 1]));
            if (close !== -1 && close < end && close > index + 1 && text[close + 1] !== marker && !underscoreInsideWord) {
                tokens.push({ start: index, endExclusive: close + 1, kind: "italic" });
                index = close + 1;
                continue;
            }
        }
        const linked = readLink(text, index, end);
        if (linked) {
            tokens.push(...linked.tokens);
            index = linked.next;
            continue;
        }
        if (text[index] === "<") {
            const autolink = readAutolink(text, index, end);
            if (autolink !== undefined) {
                tokens.push({ start: index, endExclusive: autolink, kind: "link" });
                index = autolink;
                continue;
            }
        }
        if (isUrlStart(text, index)) {
            const urlEnd = scanUrl(text, index, end);
            if (urlEnd > index) {
                tokens.push({ start: index, endExclusive: urlEnd, kind: "link" });
                index = urlEnd;
                continue;
            }
        }
        index++;
    }
}

function readLink(
    text: string,
    index: number,
    end: number,
): { tokens: MarkdownSourceToken[]; next: number } | undefined {
    const start = text[index] === "!" && text[index + 1] === "[" ? index + 1 : index;
    if (text[start] !== "[") {
        return undefined;
    }
    const labelEnd = text.indexOf("]", start + 1);
    if (labelEnd === -1 || labelEnd >= end) {
        return undefined;
    }
    const after = labelEnd + 1;
    if (text[after] === "(") {
        const close = text.indexOf(")", after + 1);
        if (close === -1 || close >= end) {
            return undefined;
        }
        const insideStart = after + 1;
        const urlEnd = scanUrl(text, skipSpaces(text, insideStart, close), close);
        const tokens: MarkdownSourceToken[] = [{ start, endExclusive: labelEnd + 1, kind: "linkLabel" }];
        if (urlEnd > insideStart) {
            tokens.push({ start: skipSpaces(text, insideStart, close), endExclusive: urlEnd, kind: "link" });
        }
        return { tokens, next: close + 1 };
    }
    if (text[after] === "[") {
        const refEnd = text.indexOf("]", after + 1);
        if (refEnd === -1 || refEnd >= end) {
            return undefined;
        }
        return { tokens: [{ start, endExclusive: refEnd + 1, kind: "linkLabel" }], next: refEnd + 1 };
    }
    return undefined;
}

function readAutolink(text: string, index: number, end: number): number | undefined {
    const close = text.indexOf(">", index + 1);
    if (close === -1 || close >= end) {
        return undefined;
    }
    const body = text.slice(index + 1, close);
    if (!/^https?:\/\/\S+$/.test(body) && !/^mailto:\S+$/.test(body)) {
        return undefined;
    }
    return close + 1;
}

function isUrlStart(text: string, index: number): boolean {
    return text.startsWith("https://", index) || text.startsWith("http://", index);
}

function scanUrl(text: string, start: number, end: number): number {
    let index = start;
    while (index < end && text[index] !== " " && text[index] !== "\t" && text[index] !== ")" && text[index] !== ">") {
        index++;
    }
    while (index > start && ".,;:".includes(text[index - 1] ?? "")) {
        index--;
    }
    return index;
}

function isWordChar(char: string | undefined): boolean {
    return char !== undefined && /[A-Za-z0-9]/.test(char);
}

function skipSpaces(text: string, index: number, end: number): number {
    let cursor = index;
    while (cursor < end && (text[cursor] === " " || text[cursor] === "\t")) {
        cursor++;
    }
    return cursor;
}
