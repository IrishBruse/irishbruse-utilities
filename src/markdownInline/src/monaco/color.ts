function channelByte(raw: string): number {
    const trimmed = raw.trim();
    const value = trimmed.endsWith("%")
        ? Number(trimmed.slice(0, -1)) / 100 * 255
        : Number(trimmed);
    if (!Number.isFinite(value)) {
        return Number.NaN;
    }
    return Math.max(0, Math.min(255, Math.round(value)));
}

function alphaByte(raw: string): number {
    const trimmed = raw.trim();
    const value = trimmed.endsWith("%")
        ? Number(trimmed.slice(0, -1)) / 100
        : Number(trimmed);
    if (!Number.isFinite(value)) {
        return Number.NaN;
    }
    return Math.max(0, Math.min(255, Math.round(value * 255)));
}

function hexByte(value: number): string {
    return value.toString(16).padStart(2, "0");
}

export function toMonacoColor(value: string): string | undefined {
    const trimmed = value.trim();
    const short = trimmed.match(/^#([0-9a-fA-F]{3,4})$/);
    if (short) {
        return `#${[...short[1]].map((digit) => digit + digit).join("")}`;
    }
    if (/^#[0-9a-fA-F]{6}(?:[0-9a-fA-F]{2})?$/.test(trimmed)) {
        return trimmed;
    }
    const rgb = trimmed.match(/^rgba?\(\s*([^,)\s]+)\s*,\s*([^,)\s]+)\s*,\s*([^,)\s]+)(?:\s*,\s*([^)]+))?\s*\)$/i);
    if (!rgb) {
        return undefined;
    }
    const r = channelByte(rgb[1]);
    const g = channelByte(rgb[2]);
    const b = channelByte(rgb[3]);
    if (!Number.isFinite(r) || !Number.isFinite(g) || !Number.isFinite(b)) {
        return undefined;
    }
    const rgbHex = `${hexByte(r)}${hexByte(g)}${hexByte(b)}`;
    if (rgb[4] === undefined) {
        return `#${rgbHex}`;
    }
    const a = alphaByte(rgb[4]);
    if (!Number.isFinite(a)) {
        return undefined;
    }
    if (a >= 255) {
        return `#${rgbHex}`;
    }
    return `#${rgbHex}${hexByte(a)}`;
}
