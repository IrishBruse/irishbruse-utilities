import type { Scope } from "../../document/types";

export const fenceLanguageInjectClass = "inline-md-lang";
export const fenceLineClass = "inline-md-code-line";

export function lineClass(scope: Scope): string | undefined {
    if (scope.kind === "codeBlock") {
        return fenceLineClass;
    }
    return undefined;
}

export function languageInjectText(scope: Scope): string {
    return scope.language && scope.language.length > 0 ? scope.language : "text";
}
