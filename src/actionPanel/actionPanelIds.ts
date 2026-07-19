export function slugifyId(label: string): string {
    const words = label.trim().split(/\s+/);
    if (words.length === 0) {
        return "";
    }

    return words
        .map((word, index) => {
            const cleaned = word.replace(/[^a-zA-Z0-9]/g, "");
            if (!cleaned) {
                return "";
            }
            const lower = cleaned.toLowerCase();
            return index === 0 ? lower : lower.charAt(0).toUpperCase() + lower.slice(1);
        })
        .filter(Boolean)
        .join("");
}

export function uniqueActionId(label: string, existingIds: Set<string>, preferredId?: string): string {
    if (preferredId && !existingIds.has(preferredId)) {
        return preferredId;
    }

    const base = slugifyId(label) || "action";
    if (!existingIds.has(base)) {
        return base;
    }

    let index = 2;
    while (existingIds.has(`${base}${index}`)) {
        index += 1;
    }
    return `${base}${index}`;
}
