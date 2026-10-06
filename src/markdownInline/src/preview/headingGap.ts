export const HEADING_SCALE = [1, 1.5, 1.4, 1.25, 1.1, 1, 0.85];

export const headingGapZoneClass = "inline-md-heading-gap-zone";

const HEADING_GAP_FACTOR = 0.5;

export function headingGapPx(level: number, fontSize: number): number {
    const scale = HEADING_SCALE[level] ?? 1;
    if (scale <= 1 || fontSize <= 0) {
        return 0;
    }
    return Math.round(fontSize * (scale - 1) * HEADING_GAP_FACTOR);
}

export function headingAscentPx(_level: number, _fontSize: number, _lineHeight: number): number {
    return 0;
}

export function headingLineHeightPx(_level: number, _fontSize: number, lineHeight: number): number {
    return lineHeight;
}

export function headingSelectionPadPx(fontSize: number): number {
    if (fontSize <= 0) {
        return 0;
    }
    return Math.round(fontSize * 0.45);
}
