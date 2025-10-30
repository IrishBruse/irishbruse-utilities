import { existsSync, mkdirSync, readdirSync, rmSync } from "fs";
import { writeFile } from "fs/promises";
import os from "os";
import path from "path";
import {
    Command,
    commands,
    Event,
    EventEmitter,
    ExtensionContext,
    languages,
    TabInputText,
    TextDocument,
    ThemeIcon,
    TreeDataProvider,
    TreeItem,
    TreeItemCollapsibleState,
    Uri,
    window,
    workspace,
} from "vscode";
import { Commands, Views } from "../constants";
import { SnippetsPath } from "../extension";
import { registerCommandIB } from "../utils/vscode";
import {
    GeneratedMap,
    getLanguageIdMappings,
    getSnippetLanguages,
    getSnippetsByLanguageId,
    saveFile,
    stringifySnippet,
} from "./utility";

const snippetDir = path.join(os.tmpdir(), "ib-utilities_snippet-editor");

if (!existsSync(snippetDir)) {
    mkdirSync(snippetDir);
}

export type Snippet = {
    prefix?: string;
    body: string[];
    isFileTemplate?: boolean;
    description?: string;
};

export type Snippets = Record<string, Snippet>;

class SnippetTreeItem extends TreeItem {
    constructor(
        public readonly languageId: string,
        public readonly type: "file" | "folder" | "readonly",
        public readonly collapsibleState: TreeItemCollapsibleState,
        public readonly description: string | undefined,
        public readonly iconPath: ThemeIcon,
        public readonly command?: Command
    ) {
        super(languageId, collapsibleState);

        if (type !== "folder") {
            this.resourceUri = Uri.parse("file:///" + languageId + ".snippet");
        } else {
            this.resourceUri = Uri.parse("file:///" + languageId);
            this.contextValue = "language";
        }

        this.tooltip = "snippets/" + languageId + ".json";
        this.description = description;
        this.iconPath = iconPath;
        this.command = command;
    }
}

export class SnippetViewProvider implements TreeDataProvider<SnippetTreeItem> {
    private changeEvent = new EventEmitter<SnippetTreeItem | undefined>();

    constructor() {}

    public get onDidChangeTreeData(): Event<SnippetTreeItem | undefined> {
        return this.changeEvent.event;
    }

    static activate(context: ExtensionContext) {
        const snippetDataProvider = new SnippetViewProvider();
        window.registerTreeDataProvider(Views.SnippetView, snippetDataProvider);

        registerCommandIB(
            Commands.ShowSnippetView,
            () => commands.executeCommand(Commands.ViewSnippetContainer),
            context
        );
        registerCommandIB(Commands.RefreshSnippetView, () => snippetDataProvider.refresh(), context);

        registerCommandIB(Commands.OpenSnippet, snippetDataProvider.openSnippet, context);
        registerCommandIB(Commands.AddSnippet, (i) => snippetDataProvider.addSnippet(i), context);
        registerCommandIB(Commands.EditSnippetFile, snippetDataProvider.editSnippetFile, context);

        context.subscriptions.push(workspace.onDidSaveTextDocument(snippetDataProvider.save));
    }

    static async deactivate(): Promise<void> {
        const files = readdirSync(snippetDir);
        for (const group of window.tabGroups.all) {
            for (const tab of group.tabs) {
                if (!(tab.input instanceof TabInputText)) {
                    continue;
                }

                const uri = tab.input.uri;
                if (!uri.fsPath.startsWith(snippetDir)) {
                    continue;
                }

                const fullPath = path.join(snippetDir, uri.fsPath);
                if (!files.includes(fullPath)) {
                    rmSync(uri.fsPath);
                }
            }
        }
    }

    refresh() {
        this.changeEvent.fire(undefined);
    }

    getTreeItem(element: SnippetTreeItem): TreeItem {
        return element;
    }

    async getChildren(parent?: SnippetTreeItem): Promise<SnippetTreeItem[]> {
        if (!parent) {
            const languages = await getSnippetLanguages();

            return languages
                .map((languageId) => {
                    const state = TreeItemCollapsibleState.Collapsed;

                    return new SnippetTreeItem(
                        languageId,
                        "folder",
                        state,
                        GeneratedMap[languageId] ? "(generated)" : undefined,
                        ThemeIcon.Folder
                    );
                })
                .sort((a, b) => {
                    if (GeneratedMap[b.languageId]) {
                        return -100;
                    }
                    return a.languageId.localeCompare(b.languageId);
                });
        }

        if (parent.collapsibleState === TreeItemCollapsibleState.None) {
            return [];
        }

        const snippets = getSnippetsByLanguageId(parent.languageId);
        const snippetItems: SnippetTreeItem[] = [];

        for (const [key, value] of Object.entries(snippets)) {
            snippetItems.push(
                new SnippetTreeItem(
                    key,
                    "file",
                    TreeItemCollapsibleState.None,
                    value.description,
                    GeneratedMap[parent.languageId] === undefined
                        ? new ThemeIcon("symbol-snippet")
                        : new ThemeIcon("lock"),
                    {
                        title: "Open Snippet",
                        command: Commands.OpenSnippet,
                        arguments: [key, value, parent.languageId],
                    }
                )
            );
        }

        return snippetItems;
    }

    async openSnippet(key: string, snippet: Snippet, group: string) {
        if (!key) {
            window.showErrorMessage("Missing key argument");
            return;
        }

        if (!snippet) {
            window.showErrorMessage("Missing snippet argument");
            return;
        }

        if (!group) {
            window.showErrorMessage("Missing group argument");
            return;
        }

        const langIds = getLanguageIdMappings();
        const languageId = langIds[group] ?? group;

        const snippetContent = await stringifySnippet(group, snippet);

        const snippetPath = path.join(snippetDir, `${key}.${group}.snippet`);

        await writeFile(snippetPath, snippetContent);

        let editor = await window.showTextDocument(Uri.file(snippetPath), { preview: true });

        if (GeneratedMap[group]) {
            await commands.executeCommand("workbench.action.files.setActiveEditorReadonlyInSession");
        }

        try {
            await languages.setTextDocumentLanguage(editor.document, languageId);
        } catch (error) {
            // Ignore and use plaintext
        }
    }

    async save(file: TextDocument) {
        if (!file.fileName.startsWith(snippetDir) || !file.fileName.endsWith(".snippet")) {
            return;
        }

        const snippetPath = file.fileName;

        await saveFile(snippetPath);
    }

    async addSnippet(item: SnippetTreeItem) {
        if (!item) {
            window.showErrorMessage("Only call add snippet on langauges in snippet manager");
            return;
        }

        const languageId = item.languageId;

        const key = await window.showInputBox({ prompt: "Snippet name (key)", placeHolder: "mySnippet" });
        if (!key) {
            window.showErrorMessage("Snippet name is required");
            return;
        }

        const snippet: Snippet = {
            prefix: key,
            description: "",
            isFileTemplate: false,
            body: ["replace me"],
        };

        const content = await stringifySnippet(languageId, snippet);

        const snippetPath = path.join(snippetDir, `${key}.${languageId}.snippet`);
        await writeFile(snippetPath, content);

        const editor = await window.showTextDocument(Uri.file(snippetPath));

        const langIds = getLanguageIdMappings();
        const mapped = langIds[languageId] ?? languageId;
        try {
            await languages.setTextDocumentLanguage(editor.document, mapped);
            this.refresh();
        } catch (error) {
            // ignore
        }

        await saveFile(snippetPath);
        this.refresh();
    }

    async editSnippetFile(item: SnippetTreeItem) {
        if (!item) {
            window.showErrorMessage("Only call add snippet on langauges in snippet manager");
            return;
        }

        const languageId = item.languageId;

        const snippetPath = path.join(SnippetsPath, `${languageId}.json`);

        try {
            await window.showTextDocument(Uri.file(snippetPath));
        } catch (error) {
            window.showErrorMessage("test" + error);
        }
    }
}
