import type { Scope, TextRange } from "../../document/types";

export function styleClass(scope: Scope): string | undefined {
    if (scope.kind !== "strikethrough") {
        return undefined;
    }
    return "inline-md-strike";
}

export function styleRange(scope: Scope): TextRange | undefined {
    if (scope.kind !== "strikethrough") {
        return undefined;
    }
    return { start: scope.contentStart, end: scope.contentEnd };
}
