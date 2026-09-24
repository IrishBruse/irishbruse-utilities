export interface MarkdownEditorInitialState {
    readonly content: string;
    readonly documentVersion: number;
    readonly readonly: boolean;
}

export function encodeWebviewInitialState(state: MarkdownEditorInitialState): string {
    return encodeURIComponent(JSON.stringify(state));
}
