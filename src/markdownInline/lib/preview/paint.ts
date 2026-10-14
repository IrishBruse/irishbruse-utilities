import type { Scope, TextRange } from "../document/types";
import { styleClass as codeStyleClass, styleRange as codeStyleRange } from "../markdown/code/style";
import {
    styleClass as emphasisStyleClass,
    styleRange as emphasisStyleRange,
} from "../markdown/emphasis/style";
import {
    styleClass as headingStyleClass,
    styleRange as headingStyleRange,
} from "../markdown/heading/style";
import { styleClass as linkStyleClass, styleRange as linkStyleRange } from "../markdown/link/style";
import {
    styleClass as strikeStyleClass,
    styleRange as strikeStyleRange,
} from "../markdown/strike/style";
import {
    styleClass as strongStyleClass,
    styleRange as strongStyleRange,
} from "../markdown/strong/style";

export function previewContentClass(scope: Scope): string | undefined {
    return (
        headingStyleClass(scope) ??
        strongStyleClass(scope) ??
        emphasisStyleClass(scope) ??
        strikeStyleClass(scope) ??
        codeStyleClass(scope) ??
        linkStyleClass(scope)
    );
}

export function previewContentRange(scope: Scope): TextRange {
    return (
        headingStyleRange(scope) ??
        strongStyleRange(scope) ??
        emphasisStyleRange(scope) ??
        strikeStyleRange(scope) ??
        codeStyleRange(scope) ??
        linkStyleRange(scope) ?? { start: scope.contentStart, end: scope.contentEnd }
    );
}
