/** Resolve a markdown image URL against the document. Rejects script URLs. */
export function resolveImageUrl(url: string, documentUrl: string): string | undefined {
    const trimmed = url.trim();
    if (!trimmed || /^(javascript|vbscript):/i.test(trimmed)) {
        return undefined;
    }

    try {
        const resolved = documentUrl ? new URL(trimmed, documentUrl) : new URL(trimmed);
        if (resolved.protocol === "javascript:" || resolved.protocol === "vbscript:") {
            return undefined;
        }
        return resolved.href;
    } catch {
        return undefined;
    }
}
