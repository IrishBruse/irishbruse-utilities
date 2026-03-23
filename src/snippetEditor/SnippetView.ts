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
    reverseMap,
    setSnippetsByLanguageId,
    SnippetParser,
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

    static forSnippet(key: string, snippet: Snippet, isGenerated: boolean): SnippetTreeItem {
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

    static forLanguage(languageId: string): SnippetTreeItem {
        const isGenerated = !!GeneratedMap[languageId];
        return new SnippetTreeItem(
            languageId,
            "folder",
            TreeItemCollapsibleState.Collapsed,
            isGenerated ? GENERATED_LABEL : undefined,
            ThemeIcon.Folder
        );
    }
}

async function regenerateDependentSnippets(languageId: string): Promise<void> {
    const reverseGeneratedMap = reverseMap(GeneratedMap);
    const dependents = reverseGeneratedMap[languageId];

    if (dependents) {
        for (const dependentLanguageId of dependents) {
            await generateSnippetsForLanguage(dependentLanguageId, GeneratedMap[dependentLanguageId]);
        }
    }
}

export class SnippetViewProvider implements TreeDataProvider<SnippetTreeItem> {
    private changeEvent = new EventEmitter<SnippetTreeItem | undefined>();

    public get onDidChangeTreeData(): Event<SnippetTreeItem | undefined> {
        return this.changeEvent.event;
    }

    static activate(context: ExtensionContext) {
        const provider = new SnippetViewProvider();
        window.registerTreeDataProvider(Views.SnippetView, provider);

        registerCommandIB(
            Commands.ShowSnippetView,
            () => commands.executeCommand(Commands.ViewSnippetContainer),
            context
        );
        registerCommandIB(Commands.RefreshSnippetView, () => provider.refresh(), context);

        // openSnippet is an arrow property — `this` is preserved when passed as a reference
        registerCommandIB(Commands.OpenSnippet, provider.openSnippet, context);

        registerCommandIB(Commands.AddSnippet, (i) => provider.addSnippet(i), context);
        registerCommandIB(Commands.EditSnippet, (i) => provider.editSnippet(i), context);
        registerCommandIB(Commands.DeleteSnippet, (i) => provider.deleteSnippet(i), context);

        context.subscriptions.push(workspace.onDidSaveTextDocument((e) => provider.save(e)));
    }

    static async deactivate(): Promise<void> {
        for (const group of window.tabGroups.all) {
            for (const tab of group.tabs) {
                if (!(tab.input instanceof TabInputText)) {
                    continue;
                }

                const { fsPath } = tab.input.uri;
                if (fsPath.startsWith(snippetDir)) {
                    rmSync(fsPath, { force: true });
                }
            }
        }
    }

    refresh(): void {
        this.changeEvent.fire(undefined);
    }

    getTreeItem(element: SnippetTreeItem): TreeItem {
        return element;
    }

    async getChildren(parent?: SnippetTreeItem): Promise<SnippetTreeItem[]> {
        if (!parent) {
            const langs = await getSnippetLanguages();
            return this.getLanguageChildren(langs);
        }
        return this.getSnippetChildren(parent);
    }

    private getSnippetChildren(parent: SnippetTreeItem): SnippetTreeItem[] {
        if (parent.collapsibleState === TreeItemCollapsibleState.None) {
            return [];
        }

        const snippets = getSnippetsFile(parent.label);
        const isGenerated = GeneratedMap[parent.label] !== undefined;

        return Object.entries(snippets).map(([key, value]) => {
            value.languageId = parent.label;
            return SnippetTreeItem.forSnippet(key, value, isGenerated);
        });
    }

    private getLanguageChildren(langs: string[]): SnippetTreeItem[] {
        return langs
            .map((languageId) => SnippetTreeItem.forLanguage(languageId))
            .sort((a, b) => {
                if (GeneratedMap[b.label]) {
                    return -100;
                }
                return a.label.localeCompare(b.label);
            });
    }

    // Arrow property so `this` is preserved when passed as a reference to registerCommandIB
    openSnippet = async (key: string, snippet: Snippet): Promise<void> => {
        if (!key) {
            window.showErrorMessage("Missing key argument");
            return;
        }
        if (!snippet) {
            window.showErrorMessage("Missing snippet argument");
            return;
        }

        const snippetPath = path.join(snippetDir, key);
        await writeFile(snippetPath, await SnippetParser.stringify(snippet));

        const editor = await window.showTextDocument(Uri.file(snippetPath), { preview: true });

        if (GeneratedMap[snippet.languageId]) {
            await commands.executeCommand("workbench.action.files.setActiveEditorReadonlyInSession");
        }

        try {
            const langIds = getLanguageIdMappings();
            await languages.setTextDocumentLanguage(editor.document, langIds[snippet.languageId] ?? snippet.languageId);
        } catch {
            // Ignore and fall back to plaintext
        }
    };

    async save(file: TextDocument): Promise<void> {
        if (!file.fileName.startsWith(snippetDir)) {
            return;
        }

        await SnippetViewProvider.saveSnippetFile(file.fileName);
        this.refresh();
    }

    async addSnippet(item: SnippetTreeItem): Promise<void> {
        const languageId = SnippetViewProvider.requireLabel(item, "add snippet");
        if (!languageId) {
            return;
        }

        const key = await window.showInputBox({ prompt: "Snippet name (key)", placeHolder: "mySnippet" });
        if (!key) {
            return;
        }

        const snippet: Snippet = {
            languageId,
            prefix: key,
            description: "",
            isFileTemplate: false,
            body: ["replace me"],
        };

        const snippetPath = path.join(snippetDir, key);
        await writeFile(snippetPath, await SnippetParser.stringify(snippet));

        const editor = await window.showTextDocument(Uri.file(snippetPath));

        const langIds = getLanguageIdMappings();
        try {
            await languages.setTextDocumentLanguage(editor.document, langIds[languageId] ?? languageId);
        } catch {
            // Ignore and fall back to plaintext
        }

        await SnippetViewProvider.saveSnippetFile(snippetPath);
        this.refresh();
    }

    async editSnippet(item: SnippetTreeItem): Promise<void> {
        const languageId = SnippetViewProvider.requireLabel(item, "edit snippet");
        if (!languageId) {
            return;
        }

        try {
            await window.showTextDocument(Uri.file(path.join(SnippetsPath, `${languageId}.json`)));
        } catch (error) {
            window.showErrorMessage("Failed to open snippet file: " + error);
        }
    }

    async deleteSnippet(item: SnippetTreeItem): Promise<void> {
        const languageId = SnippetViewProvider.requireLabel(item, "delete snippet");
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

    private static requireLabel(item: SnippetTreeItem | undefined, context: string): string | null {
        if (!item) {
            window.showErrorMessage(`Only call ${context} on languages in snippet manager`);
            return null;
        }
        return item.label;
    }

    private static async saveSnippetFile(snippetPath: string): Promise<void> {
        const key = path.basename(snippetPath);
        const text = await readFile(snippetPath);
        const snippet = await SnippetParser.parse(text.toString());

        if (!snippet) {
            window.showErrorMessage("Failed to parse snippet");
            return;
        }

        const { languageId, ...snippetWithoutId } = snippet;
        const snippets = getSnippetsFile(languageId) as Record<string, Omit<Snippet, "languageId">>;
        snippets[key] = snippetWithoutId;

        await setSnippetsByLanguageId(languageId, snippets as Snippets);
        await regenerateDependentSnippets(languageId);
    }
}
