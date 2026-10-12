export type Snippet = {
    languageId: string;
    prefix?: string;
    body: string[];
    isFileTemplate?: boolean;
    description?: string;
};

export type Snippets = Record<string, Snippet>;

export type SnippetOpenCommandArgs = [key: string, snippet: Snippet];
