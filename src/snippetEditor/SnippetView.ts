import { existsSync, mkdirSync, readdirSync, rmSync } from "fs";
import { readFile, writeFile } from "fs/promises";
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
    generateSnippetsForLanguage,
    getLanguageIdMappings,
    getSnippetLanguages,
    getSnippetsFile,
    parseSnippet,
    reverseMap,
    setSnippetsByLanguageId,
    stringifySnippet,
} from "./utility";

const snippetDir = path.join(os.tmpdir(), "ib-utilities_snippet-editor");

if (!existsSync(snippetDir)) {
    mkdirSync(snippetDir);
}

export type Snippet = {
    languageId: string;
    prefix?: string;
    body: string[];
    isFileTemplate?: boolean;
    description?: string;
};

export type Snippets = Record<string, Snippet>;

class SnippetTreeItem extends TreeItem {
    constructor(
        public readonly label: string,
        public readonly type: "file" | "folder" | "readonly",
        public readonly collapsibleState: TreeItemCollapsibleState,
        public readonly description: string | undefined,
        public readonly iconPath: ThemeIcon,
        public readonly command?: Command
    ) {
        super(label, collapsibleState);

        if (type !== "folder") {
            this.tooltip = description ?? label;
            this.resourceUri = Uri.parse("file:///" + label + ".snippet");
        } else {
            this.tooltip = "snippets/" + label + ".json";
            this.resourceUri = Uri.parse("file:///" + label);
        }

        this.contextValue = type;
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
        registerCommandIB(Commands.EditSnippet, snippetDataProvider.editSnippet, context);
        registerCommandIB(Commands.DeleteSnippet, (i) => snippetDataProvider.deleteSnippet(i), context);

        // TODO: is there a better way of creating these extension files
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
            return this.getSnippetKeyChildren(languages);
        } else {
            return this.getSnippetLanguageChildren(parent);
        }
    }
    getSnippetLanguageChildren(parent: SnippetTreeItem): SnippetTreeItem[] {
        if (parent.collapsibleState === TreeItemCollapsibleState.None) {
            return [];
        }

        const languageId = parent.label;

        const snippets = getSnippetsFile(languageId);
        const snippetItems: SnippetTreeItem[] = [];

        for (const [key, value] of Object.entries(snippets)) {
            value.languageId = languageId;
            snippetItems.push(
                new SnippetTreeItem(
                    key,
                    "file",
                    TreeItemCollapsibleState.None,
                    value.description,
                    GeneratedMap[parent.label] === undefined ? new ThemeIcon("symbol-snippet") : new ThemeIcon("lock"),
                    {
                        title: "Open Snippet",
                        command: Commands.OpenSnippet,
                        arguments: [key, value],
                    }
                )
            );
        }

        return snippetItems;
    }

    private getSnippetKeyChildren(languages: string[]) {
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
                if (GeneratedMap[b.label]) {
                    return -100;
                }
                return a.label.localeCompare(b.label);
            });
    }

    async openSnippet(key: string, snippet: Snippet) {
        if (!key) {
            window.showErrorMessage("Missing key argument");
            return;
        }

        if (!snippet) {
            window.showErrorMessage("Missing snippet argument");
            return;
        }

        const snippetPath = path.join(snippetDir, key);
        const snippetContent = await stringifySnippet(snippet);
        await writeFile(snippetPath, snippetContent);

        let editor = await window.showTextDocument(Uri.file(snippetPath), { preview: true });

        const languageId = snippet.languageId;

        if (GeneratedMap[languageId]) {
            await commands.executeCommand("workbench.action.files.setActiveEditorReadonlyInSession");
        }

        try {
            const langIds = getLanguageIdMappings();
            await languages.setTextDocumentLanguage(editor.document, langIds[languageId] ?? languageId);
        } catch (error) {
            // Ignore and use plaintext
        }
    }

    async save(file: TextDocument) {
        if (!file.fileName.startsWith(snippetDir)) {
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

        const languageId = item.label;

        const key = await window.showInputBox({ prompt: "Snippet name (key)", placeHolder: "mySnippet" });
        if (!key) {
            return;
        }

        const snippet: Snippet = {
            languageId: languageId,
            prefix: key,
            description: "",
            isFileTemplate: false,
            body: ["replace me"],
        };

        const content = await stringifySnippet(snippet);

        const snippetPath = path.join(snippetDir, key);
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

    async editSnippet(item: SnippetTreeItem) {
        if (!item) {
            window.showErrorMessage("Only call edit snippet on langauges in snippet manager");
            return;
        }

        const languageId = item.label;

        const snippetPath = path.join(SnippetsPath, `${languageId}.json`);

        try {
            await window.showTextDocument(Uri.file(snippetPath));
        } catch (error) {
            window.showErrorMessage("test" + error);
        }
    }

    async deleteSnippet(item: SnippetTreeItem) {
        if (!item) {
            window.showErrorMessage("Only call delete snippet on langauges in snippet manager");
            return;
        }

        const key = item.label;
        const languageId = item.command?.arguments![1]["languageId"]; // TODO: improve this

        if (!key || typeof key !== "string") {
            window.showErrorMessage("Invalid snippet key");
            return;
        }

        const answer = await window.showWarningMessage(
            `Delete snippet '${key}' from '${languageId}'? This cannot be undone.`,
            { modal: true },
            "Delete"
        );

        if (answer !== "Delete") {
            return;
        }

        try {
            const snippets = getSnippetsFile(languageId);

            if (!snippets || !Object.prototype.hasOwnProperty.call(snippets, key)) {
                window.showErrorMessage(`Snippet '${key}' not found for '${languageId}'`);
                return;
            }

            delete snippets[key];

            await setSnippetsByLanguageId(languageId, snippets);

            const reverseGeneratedMap = reverseMap(GeneratedMap);
            const languagesToGenerate = reverseGeneratedMap[languageId];

            if (languagesToGenerate) {
                for (const dependentLanguageId of languagesToGenerate) {
                    await generateSnippetsForLanguage(dependentLanguageId, GeneratedMap[dependentLanguageId]);
                }
            }

            this.refresh();
            window.showInformationMessage(`Deleted snippet '${key}' from '${languageId}'`);
        } catch (err) {
            window.showErrorMessage(`Failed to delete snippet: ${String(err)}`);
        }
    }
}

async function saveFile(snippetPath: string) {
    const key = path.basename(snippetPath);

    const snippetText = await readFile(snippetPath);

    const snippet = await parseSnippet(snippetText.toString());

    if (!snippet) {
        window.showErrorMessage("Failed to parse snippet");
        return;
    }

    const languageId = snippet.languageId;
    delete (snippet as any)["languageId"];

    const snippets = getSnippetsFile(languageId);
    snippets[key] = snippet;
    await setSnippetsByLanguageId(languageId, snippets);

    const reverseGeneratedMap = reverseMap(GeneratedMap);

    const languagesToGenerate = reverseGeneratedMap[languageId];

    if (languagesToGenerate) {
        for (const dependentLanguageId of languagesToGenerate) {
            await generateSnippetsForLanguage(dependentLanguageId, GeneratedMap[dependentLanguageId]);
        }
    }
}
