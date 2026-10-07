const HEADING_SCALE = [1, 1.5, 1.4, 1.25, 1.1, 1, 0.85];

function headingFontScale(level: number): number {
    return HEADING_SCALE[level] ?? 1;
}

export function applyHeadingFontScales(root: HTMLElement): void {
    for (let level = 1; level <= 6; level += 1) {
        root.style.setProperty(`--ib-md-h${level}-scale`, String(headingFontScale(level)));
    }
}

export function headingLineHeightMultiplier(level: number): number | undefined {
    const scale = headingFontScale(level);
    if (scale <= 1) {
        return undefined;
    }
    return scale;
}

export function headingSelectionPadPx(fontSize: number): number {
    if (fontSize <= 0) {
        return 0;
    }
    return Math.round(fontSize * 0.45);
}
