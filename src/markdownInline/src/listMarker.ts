export function listMarkerIndentColumns(line: string, markerColumn: number, tabSize: number): number {
    const before = line.slice(0, Math.max(0, markerColumn - 1));
    let columns = 0;
    for (const character of before) {
        if (character === "\t") {
            columns += tabSize;
        } else if (character === " ") {
            columns += 1;
        }
    }
    return columns;
}

export function listMarkerBulletClass(indentColumns: number): string {
    const clamped = Math.max(0, Math.min(indentColumns, 24));
    return `inline-md-list-bullet inline-md-list-indent-${clamped}`;
}
