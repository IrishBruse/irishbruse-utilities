import { vi } from "vitest";

vi.mock("vscode", () => ({
    workspace: {
        getConfiguration: vi.fn().mockReturnValue({
            get: vi.fn().mockReturnValue({}),
        }),
        fs: {
            writeFile: vi.fn().mockResolvedValue(undefined),
            readFile: vi.fn().mockResolvedValue(Buffer.from("")),
        },
    },
    window: {
        showErrorMessage: vi.fn().mockResolvedValue(undefined),
        showWarningMessage: vi.fn().mockResolvedValue(undefined),
        showInformationMessage: vi.fn().mockResolvedValue(undefined),
        showTextDocument: vi.fn().mockResolvedValue({
            save: vi.fn().mockResolvedValue(undefined),
            getText: vi.fn().mockReturnValue(""),
            positionAt: vi.fn().mockReturnValue({ line: 0, character: 0 }),
        }),
        showInputBox: vi.fn().mockResolvedValue(undefined),
        createTextEditorDecorationType: vi.fn().mockReturnValue({}),
        tabGroups: { all: [] },
    },
    commands: {
        executeCommand: vi.fn().mockResolvedValue(undefined),
        registerCommand: vi.fn().mockReturnValue({ dispose: vi.fn() }),
    },
    comments: {
        createCommentController: vi.fn().mockReturnValue({
            options: undefined,
            createCommentThread: vi.fn().mockReturnValue({
                dispose: vi.fn(),
                comments: [],
                collapsibleState: 0,
                contextValue: undefined,
            }),
        }),
    },
    CommentMode: {
        Editing: 0,
        Preview: 1,
    },
    CommentThreadCollapsibleState: {
        Collapsed: 1,
        Expanded: 2,
    },
    MarkdownString: vi.fn().mockImplementation((value: string) => ({ value })),
    extensions: { all: [] },
    languages: {
        setTextDocumentLanguage: vi.fn().mockResolvedValue(undefined),
    },
    Uri: {
        from: (components: { scheme: string; path?: string; query?: string }) => {
            const base = {
                scheme: components.scheme,
                path: components.path ?? "",
                fsPath: components.path ?? "",
                query: components.query ?? "",
            };
            return {
                ...base,
                with: (change: { scheme?: string; query?: string }) => ({
                    ...base,
                    scheme: change.scheme ?? base.scheme,
                    query: change.query ?? base.query,
                    with: vi.fn(),
                }),
            };
        },
        parse: vi.fn().mockReturnValue({ fsPath: "", toString: vi.fn() }),
        file: (fsPath: string) => ({
            scheme: "file",
            fsPath,
            path: fsPath,
            query: "",
            with: (change: { scheme?: string; query?: string }) => ({
                scheme: change.scheme ?? "file",
                fsPath,
                path: fsPath,
                query: change.query ?? "",
            }),
        }),
    },
    Range: vi.fn().mockImplementation((line: number) => ({ start: { line }, end: { line } })),
    Position: vi.fn(),
    ThemeColor: vi.fn(),
    ThemeIcon: {
        Folder: { id: "folder" },
        File: { id: "file" },
        Snippet: { id: "symbol-snippet" },
        Lock: { id: "lock" },
    },
    TreeDataProvider: class {},
    TreeItem: class {},
    Event: class {},
    EventEmitter: class {
        event() { return vi.fn(); }
        fire() {}
    },
    TreeItemCollapsibleState: {
        None: 0,
        Collapsed: 1,
        Expanded: 2,
    },
    TabInputText: class {},
    TabInputCustom: class {},
    ColorThemeKind: {
        Light: 1,
        Dark: 2,
        HighContrast: 3,
        HighContrastLight: 4,
    },
}));

vi.mock("../utils/languages", () => ({
    getLineCommentSyntax: vi.fn().mockResolvedValue("//"),
    getExtensionFromLanguageId: vi.fn().mockReturnValue(".ts"),
}));
