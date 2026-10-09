function skipQuotePrefixes(line: string): { depth: number; contentIndex: number } {
    let depth = 0;
    let index = 0;
    while (index < line.length) {
        while (line[index] === " " || line[index] === "\t") {
            index += 1;
        }
        if (line[index] !== ">") {
            break;
        }
        depth += 1;
        index += 1;
        while (line[index] === " ") {
            index += 1;
        }
    }
    return { depth, contentIndex: index };
}

export function blockquoteLineDepth(line: string): number {
    return skipQuotePrefixes(line).depth;
}

export function blockquoteContentIndex(line: string): number {
    return skipQuotePrefixes(line).contentIndex;
}

export function blockquoteWrapIndentColumns(line: string, tabSize: number): number {
    const size = tabSize > 0 ? tabSize : 1;
    let columns = 0;
    let index = 0;
    let leading = 0;
    let inLeading = true;
    const add = (char: string): void => {
        const width = char === "\t" ? size - (columns % size) : 1;
        columns += width;
        if (inLeading) {
            leading += width;
        }
    };
    while (index < line.length) {
        while (line[index] === " " || line[index] === "\t") {
            add(line[index] === "\t" ? "\t" : " ");
            index += 1;
        }
        if (line[index] !== ">") {
            break;
        }
        inLeading = false;
        add(">");
        index += 1;
        while (line[index] === " ") {
            add(" ");
            index += 1;
        }
    }
    return columns - leading;
}

export function blockquoteDepthClass(depth: number): string {
    const clamped = Math.max(1, Math.min(depth, 5));
    return `inline-md-quote-depth-${clamped}`;
}
