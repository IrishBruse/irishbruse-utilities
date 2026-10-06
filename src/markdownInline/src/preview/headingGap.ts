export const HEADING_SCALE = [1, 1.5, 1.4, 1.25, 1.1, 1, 0.85];

const HEADING_GAP_FACTOR = 0.5;

export const HEADING_LINE_HEIGHT_MULTIPLIER = 1;

export function headingFontScale(level: number): number {
    return HEADING_SCALE[level] ?? 1;
}

export function applyHeadingFontScales(root: HTMLElement): void {
    for (let level = 1; level <= 6; level += 1) {
        root.style.setProperty(`--ib-md-h${level}-scale`, String(headingFontScale(level)));
    }
}

export function headingGapPx(level: number, fontSize: number): number {
    const scale = headingFontScale(level);
    if (scale <= 1 || fontSize <= 0) {
        return 0;
    }
    return Math.round(fontSize * (scale - 1) * HEADING_GAP_FACTOR);
}

export function headingLineHeightMultiplier(level: number): number | undefined {
    const scale = headingFontScale(level);
    if (scale <= 1) {
        return undefined;
    }
    return scale * HEADING_LINE_HEIGHT_MULTIPLIER;
}

export function headingViewLineHeightPx(bodyLineHeightPx: number, level: number): number {
    const multiplier = headingLineHeightMultiplier(level);
    if (multiplier === undefined) {
        return bodyLineHeightPx;
    }
    return Math.round(bodyLineHeightPx * multiplier);
}

export function headingSelectionPadPx(fontSize: number): number {
    if (fontSize <= 0) {
        return 0;
    }
    return Math.round(fontSize * 0.45);
}
