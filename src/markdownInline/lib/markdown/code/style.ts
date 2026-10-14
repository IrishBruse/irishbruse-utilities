import type { Scope, TextRange } from "../../document/types";

export function styleClass(scope: Scope): string | undefined {
    if (scope.kind !== "inlineCode") {
        return undefined;
    }
    return "inline-md-code";
}

export function styleRange(scope: Scope): TextRange | undefined {
    if (scope.kind !== "inlineCode") {
        return undefined;
    }
    return { start: scope.start, end: scope.end };
}
