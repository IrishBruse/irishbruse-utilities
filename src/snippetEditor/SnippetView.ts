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
import { getExtensionFromLanguageId } from "../utils/languages";

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

export type SnippetOpenCommandArgs = [key: string, snippet: Snippet];

const GENERATED_LABEL = "(generated)";
const ICON_SNIPPET = "symbol-snippet";
const ICON_LOCK = "lock";

class SnippetTreeItem extends TreeItem {
    constructor(
        public readonly label: string,
        public readonly type: "file" | "folder",
        public readonly collapsibleState: TreeItemCollapsibleState,
        public readonly description: string | undefined,
        public readonly iconPath: ThemeIcon,
        public readonly command?: Command
    ) {
        super(label, collapsibleState);

        this.contextValue = type;
        this.description = description;
        this.command = command;

        if (type === "folder") {
            this.tooltip = "snippets/" + label + ".json";
            const extension = getExtensionFromLanguageId(label);
            this.resourceUri = Uri.parse("file:///" + (extension ?? label));
            this.iconPath = !extension ? ThemeIcon.Folder : ThemeIcon.File;
        } else {
            this.tooltip = description ?? label;
            this.resourceUri = Uri.parse("file:///" + label + ".snippet");
            this.iconPath = iconPath;
        }
    }
}

function createSnippetFileItem(
    key: string,
    snippet: Snippet,
    isGenerated: boolean
): SnippetTreeItem {
    return new SnippetTreeItem(
        key,
        "file",
        TreeItemCollapsibleState.None,
        snippet.description,
        isGenerated ? new ThemeIcon(ICON_LOCK) : new ThemeIcon(ICON_SNIPPET),
        {
            title: "Open Snippet",
            command: Commands.OpenSnippet,
            arguments: [key, snippet],
        }
    );
}

function createLanguageFolderItem(languageId: string): SnippetTreeItem {
    const isGenerated = !!GeneratedMap[languageId];
    return new SnippetTreeItem(
        languageId,
        "folder",
        TreeItemCollapsibleState.Collapsed,
        isGenerated ? GENERATED_LABEL : undefined,
        ThemeIcon.Folder
    );
}

function validateSnippetItem(item: SnippetTreeItem | undefined, context: string): string | null {
    if (!item) {
        window.showErrorMessage(`Only call ${context} on languages in snippet manager`);
        return null;
    }
    return item.label;
}

function getLanguageIdFromTreeItem(item: SnippetTreeItem): string {
    return item.label;
}

async function regenerateDependentSnippets(languageId: string): Promise<void> {
    const reverseGeneratedMap = reverseMap(GeneratedMap);
    const languagesToGenerate = reverseGeneratedMap[languageId];

    if (languagesToGenerate) {
        for (const dependentLanguageId of languagesToGenerate) {
            await generateSnippetsForLanguage(dependentLanguageId, GeneratedMap[dependentLanguageId]);
        }
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
        registerCommandIB(Commands.EditSnippet, (i) => snippetDataProvider.editSnippet(i), context);
        registerCommandIB(Commands.DeleteSnippet, (i) => snippetDataProvider.deleteSnippet(i), context);

        context.subscriptions.push(workspace.onDidSaveTextDocument((e) => snippetDataProvider.save(e)));
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

        const snippets = getSnippetsFile(parent.label);
        const isGenerated = GeneratedMap[parent.label] !== undefined;

        return Object.entries(snippets).map(([key, value]) => {
            value.languageId = parent.label;
            return createSnippetFileItem(key, value, isGenerated);
        });
    }

    private getSnippetKeyChildren(languages: string[]) {
        return languages
            .map((languageId) => createLanguageFolderItem(languageId))
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
        } catch {
            // Ignore and use plaintext
        }
    }

    async save(file: TextDocument) {
        if (!file.fileName.startsWith(snippetDir)) {
            return;
        }

        await saveFile(file.fileName);
        this.refresh();
    }

    async addSnippet(item: SnippetTreeItem) {
        const languageId = validateSnippetItem(item, "add snippet");
        if (!languageId) {
            return;
        }

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
        } catch {
            // ignore
        }

        await saveFile(snippetPath);
        this.refresh();
    }

    async editSnippet(item: SnippetTreeItem) {
        const languageId = validateSnippetItem(item, "edit snippet");
        if (!languageId) {
            return;
        }

        const snippetPath = path.join(SnippetsPath, `${languageId}.json`);

        try {
            await window.showTextDocument(Uri.file(snippetPath));
        } catch (error) {
            window.showErrorMessage("Failed to open snippet file: " + error);
        }
    }

    async deleteSnippet(item: SnippetTreeItem) {
        const languageId = validateSnippetItem(item, "delete snippet");
        if (!languageId) {
            return;
        }

        const key = item.label;
        const args = item.command?.arguments as SnippetOpenCommandArgs | undefined;
        const snippetLanguageId = args?.[1]?.languageId ?? languageId;

        if (!key || typeof key !== "string") {
            window.showErrorMessage("Invalid snippet key");
            return;
        }

        const answer = await window.showWarningMessage(
            `Delete snippet '${key}' from '${snippetLanguageId}'? This cannot be undone.`,
            { modal: true },
            "Delete"
        );

        if (answer !== "Delete") {
            return;
        }

        try {
            const snippets = getSnippetsFile(snippetLanguageId);

            if (!snippets || !Object.prototype.hasOwnProperty.call(snippets, key)) {
                window.showErrorMessage(`Snippet '${key}' not found for '${snippetLanguageId}'`);
                return;
            }

            delete snippets[key];

            await setSnippetsByLanguageId(snippetLanguageId, snippets);

            await regenerateDependentSnippets(snippetLanguageId);

            this.refresh();

            window.showInformationMessage(`Deleted snippet '${key}' from '${snippetLanguageId}'`);
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
    const { languageId: _, ...snippetWithoutId } = snippet;

    const snippets = getSnippetsFile(languageId) as Record<string, Omit<Snippet, "languageId">>;
    snippets[key] = snippetWithoutId;
    await setSnippetsByLanguageId(languageId, snippets as Snippets);

    await regenerateDependentSnippets(languageId);
}
