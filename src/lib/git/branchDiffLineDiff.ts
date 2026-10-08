type BasicLineDiffOp =
    | { kind: "equal"; count: number }
    | { kind: "insert"; count: number }
    | { kind: "delete"; count: number };

export type LineDiffOp = BasicLineDiffOp | { kind: "replace"; deleteCount: number; insertCount: number };

function lcsTable(baseLines: readonly string[], modLines: readonly string[]): number[][] {
    const rows = baseLines.length + 1;
    const cols = modLines.length + 1;
    const table = Array.from({ length: rows }, () => new Array<number>(cols).fill(0));

    for (let baseIndex = baseLines.length - 1; baseIndex >= 0; baseIndex--) {
        for (let modIndex = modLines.length - 1; modIndex >= 0; modIndex--) {
            if (baseLines[baseIndex] === modLines[modIndex]) {
                table[baseIndex]![modIndex] = table[baseIndex + 1]![modIndex + 1]! + 1;
            } else {
                table[baseIndex]![modIndex] = Math.max(
                    table[baseIndex + 1]![modIndex]!,
                    table[baseIndex]![modIndex + 1]!
                );
            }
        }
    }

    return table;
}

export function computeLineDiffOps(baseLines: readonly string[], modLines: readonly string[]): LineDiffOp[] {
    const table = lcsTable(baseLines, modLines);
    const ops: BasicLineDiffOp[] = [];
    let baseIndex = 0;
    let modIndex = 0;

    const pushOp = (op: BasicLineDiffOp): void => {
        const last = ops[ops.length - 1];
        if (last && last.kind === op.kind) {
            last.count += op.count;
            return;
        }
        ops.push(op);
    };

    while (baseIndex < baseLines.length && modIndex < modLines.length) {
        if (baseLines[baseIndex] === modLines[modIndex]) {
            pushOp({ kind: "equal", count: 1 });
            baseIndex++;
            modIndex++;
            continue;
        }

        const down = table[baseIndex + 1]![modIndex]!;
        const right = table[baseIndex]![modIndex + 1]!;
        if (down >= right) {
            pushOp({ kind: "delete", count: 1 });
            baseIndex++;
        } else {
            pushOp({ kind: "insert", count: 1 });
            modIndex++;
        }
    }

    while (baseIndex < baseLines.length) {
        pushOp({ kind: "delete", count: 1 });
        baseIndex++;
    }

    while (modIndex < modLines.length) {
        pushOp({ kind: "insert", count: 1 });
        modIndex++;
    }

    return coalesceReplaceOps(ops);
}

function coalesceReplaceOps(ops: BasicLineDiffOp[]): LineDiffOp[] {
    const coalesced: LineDiffOp[] = [];
    for (let index = 0; index < ops.length; index++) {
        const op = ops[index]!;
        const next = ops[index + 1];
        if (op.kind === "delete" && next?.kind === "insert") {
            coalesced.push({
                kind: "replace",
                deleteCount: op.count,
                insertCount: next.count,
            });
            index++;
            continue;
        }
        coalesced.push(op);
    }
    return coalesced;
}

export function replacementTextForModifiedLineRange(
    baseLines: readonly string[],
    modLines: readonly string[],
    startLine: number,
    endLine: number,
    eol: string
): string {
    const ops = computeLineDiffOps(baseLines, modLines);
    const chunks: string[] = [];
    let modLine = 0;
    let baseLine = 0;

    for (const op of ops) {
        switch (op.kind) {
            case "equal":
                for (let count = 0; count < op.count; count++) {
                    if (modLine >= startLine && modLine <= endLine) {
                        chunks.push(baseLines[baseLine]!);
                    }
                    modLine++;
                    baseLine++;
                }
                break;
            case "insert":
                modLine += op.count;
                break;
            case "delete":
                baseLine += op.count;
                break;
            case "replace":
                if (modLine <= endLine && modLine + op.insertCount - 1 >= startLine) {
                    for (let count = 0; count < op.deleteCount; count++) {
                        chunks.push(baseLines[baseLine + count]!);
                    }
                }
                modLine += op.insertCount;
                baseLine += op.deleteCount;
                break;
        }
    }

    return chunks.join(eol);
}
