import type { Scope, TextRange } from "../../document/types";

export function headingLevel(scope: Scope): number {
    const raw = scope.level ?? 1;
    return raw >= 1 && raw <= 6 ? Math.trunc(raw) : 1;
}

export function styleClass(scope: Scope): string | undefined {
    if (scope.kind !== "heading") {
        return undefined;
    }
    return `inline-md-h${headingLevel(scope)}`;
}

export function styleRange(scope: Scope): TextRange | undefined {
    if (scope.kind !== "heading") {
        return undefined;
    }
    return { start: scope.contentStart, end: scope.contentEnd };
}
