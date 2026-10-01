export type ScopeKind =
    | "heading"
    | "strong"
    | "emphasis"
    | "strikethrough"
    | "inlineCode"
    | "link"
    | "image"
    | "listMarker"
    | "task"
    | "blockquote"
    | "blockquoteMarker"
    | "thematicBreak"
    | "codeBlock"
    | "table";

export interface TextRange {
    readonly start: number;
    readonly end: number;
}

export interface Scope {
    readonly kind: ScopeKind;
    readonly start: number;
    readonly end: number;
    readonly contentStart: number;
    readonly contentEnd: number;
    readonly markers: readonly TextRange[];
    readonly level?: number;
    readonly checked?: boolean;
    readonly url?: string;
    readonly alt?: string;
    readonly language?: string;
    readonly rows?: readonly (readonly TextRange[])[];
}

export type MarkerVisibility = "hidden" | "ghost" | "raw";

export interface CursorContext {
    readonly selectionFrom: number;
    readonly selectionTo: number;
    readonly lineStart: number;
    readonly lineEnd: number;
    readonly eolLength: number;
}
