export function blockquoteLineDepth(line: string): number {
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
    return depth;
}

export function blockquoteDepthClass(depth: number): string {
    const clamped = Math.max(1, Math.min(depth, 5));
    return `inline-md-quote-depth-${clamped}`;
}
