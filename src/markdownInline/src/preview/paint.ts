import type { Scope, TextRange } from "../document/types";
import { contentClass } from "./blockZone";

export function previewContentClass(scope: Scope): string | undefined {
    return contentClass(scope);
}

export function previewContentRange(scope: Scope): TextRange {
    return { start: scope.contentStart, end: scope.contentEnd };
}
