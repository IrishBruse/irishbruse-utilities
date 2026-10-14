const ORDERED_LIST_LINE = /^\s*\d+(?:\.\s|\)\s)/;

export function orderedListPrefix(line: string): string | undefined {
    const match = ORDERED_LIST_LINE.exec(line);
    return match ? match[0] : undefined;
}
