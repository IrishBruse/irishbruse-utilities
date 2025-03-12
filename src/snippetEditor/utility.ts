export function trimStringArray(arr: string[]): string[] {
    if (!arr || arr.length === 0) {
        return [];
    }

    let start = 0;
    let end = arr.length - 1;

    // Find the first non-empty string from the start
    while (start <= end && (!arr[start] || arr[start].trim() === "")) {
        start++;
    }

    // Find the last non-empty string from the end
    while (end >= start && (!arr[end] || arr[end].trim() === "")) {
        end--;
    }

    // If start > end, it means the entire array was empty or contained only empty strings.
    if (start > end) {
        return [];
    }

    // Slice the array to remove the empty strings from the start and end
    return arr.slice(start, end + 1);
}

export function isECMA(languageId: string) {
    return (
        languageId === "typescript" ||
        languageId === "typescriptreact" ||
        languageId === "javascript" ||
        languageId === "javascriptreact"
    );
}
