export interface MarkdownEditorInitialState {
    readonly content: string;
    readonly documentVersion: number;
    readonly readonly: boolean;
    readonly richLinksEnabled: boolean;
    readonly linkPresentationRules: readonly {
        id: string;
        source: string;
        flags: string;
        kind: string;
    }[];
    readonly tables: {
        readonly maxColumnWidth: number;
        readonly style: "wrapped" | "compact";
    };
}

export function encodeWebviewInitialState(state: MarkdownEditorInitialState): string {
    return encodeURIComponent(JSON.stringify(state));
}
