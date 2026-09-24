export interface MarkdownEditorInitialState {
    readonly content: string;
    readonly documentVersion: number;
    readonly readonly: boolean;
    readonly tables: {
        readonly maxColumnWidth: number;
        readonly style: "wrapped" | "compact";
    };
}

export function encodeWebviewInitialState(state: MarkdownEditorInitialState): string {
    return encodeURIComponent(JSON.stringify(state));
}
