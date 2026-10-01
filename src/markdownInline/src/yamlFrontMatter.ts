export interface YamlFrontMatterSpan {
    readonly yamlStart: number;
    readonly yamlEnd: number;
    readonly end: number;
    readonly yaml: string;
}

export function readYamlFrontMatter(text: string): YamlFrontMatterSpan | undefined {
    if (!text.startsWith("---")) {
        return undefined;
    }
    const firstBreak = text.indexOf("\n");
    if (firstBreak < 0) {
        return undefined;
    }
    const opener = text.slice(0, firstBreak).replace(/\r$/, "");
    if (opener !== "---") {
        return undefined;
    }
    let index = firstBreak + 1;
    while (index <= text.length) {
        const next = text.indexOf("\n", index);
        const lineEnd = next === -1 ? text.length : next;
        const line = text.slice(index, lineEnd).replace(/\r$/, "");
        if (line === "---") {
            const end = next === -1 ? lineEnd : next + 1;
            return {
                yamlStart: firstBreak + 1,
                yamlEnd: index,
                end,
                yaml: text.slice(firstBreak + 1, index),
            };
        }
        if (next === -1) {
            return undefined;
        }
        index = next + 1;
    }
    return undefined;
}

export function hasYamlFrontMatter(text: string): boolean {
    return readYamlFrontMatter(text) !== undefined;
}

export type FrontMatterSpan = YamlFrontMatterSpan;

export function readFrontMatter(text: string): FrontMatterSpan | undefined {
    return readYamlFrontMatter(text);
}
