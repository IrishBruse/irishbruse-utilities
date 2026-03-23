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
    extensions: { all: [] },
    languages: {
        setTextDocumentLanguage: vi.fn().mockResolvedValue(undefined),
    },
    Uri: {
        parse: vi.fn().mockReturnValue({ fsPath: "", toString: vi.fn() }),
        file: vi.fn().mockReturnValue({ fsPath: "", toString: vi.fn() }),
    },
    Range: vi.fn(),
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
}));

vi.mock("../utils/languages", () => ({
    getLineCommentSyntax: vi.fn().mockResolvedValue("//"),
    getExtensionFromLanguageId: vi.fn().mockReturnValue(".ts"),
}));
