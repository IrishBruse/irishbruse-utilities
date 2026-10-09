const fenceLine = /^(?:`{3,}|~{3,})/;

export function mermaidDiagramSource(body: string): string {
    const lines = body.replace(/\r\n/g, "\n").replace(/\r/g, "\n").split("\n");
    if (lines.length > 0 && fenceLine.test(lines[0] ?? "")) {
        lines.shift();
    }
    if (lines.length > 0 && fenceLine.test((lines[lines.length - 1] ?? "").trim())) {
        lines.pop();
    }
    if (lines[0] === "") {
        lines.shift();
    }
    if (lines.length > 0 && lines[lines.length - 1] === "") {
        lines.pop();
    }
    const indents = lines
        .filter((line) => line.trim().length > 0)
        .map((line) => /^ */.exec(line)?.[0].length ?? 0);
    const dedent = indents.length > 0 ? Math.min(...indents) : 0;
    return lines.map((line) => line.slice(dedent)).join("\n");
}
