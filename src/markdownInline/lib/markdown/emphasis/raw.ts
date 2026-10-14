import type { Scope, TextRange } from "../../document/types";

export function rawMarkerRanges(scope: Scope): readonly TextRange[] {
    if (scope.kind !== "emphasis") {
        return [];
    }
    return scope.markers;
}
