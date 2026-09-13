function normalizeEol(text: string): string {
    return text.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
}

export function hasDiskEditorConflict(
    editorText: string,
    baselineDiskText: string,
    currentDiskText: string,
): boolean {
    const editor = normalizeEol(editorText);
    const baseline = normalizeEol(baselineDiskText);
    const disk = normalizeEol(currentDiskText);
    return disk !== baseline && disk !== editor;
}
