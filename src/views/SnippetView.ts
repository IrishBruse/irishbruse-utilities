import * as vscode from "vscode";
import { UserPath } from "../extension";
import path from "path";
import cjson from "cjson";
import * as fs from "fs/promises";
import { openSnippet } from "../commands/openSnippet";
import { registerCommandIB } from "../utils/vscode";
import { getExtensionFromLanguageId } from "../utils/languageIdMapping";
import { Commands } from "../Contributes";

type Snippet = {
    prefix?: string;
    body: string[];
    isFileTemplate?: boolean;
    description?: string;
};

type Snippets = Record<string, Snippet>;

async function getFileExtensions(languageId: string): Promise<string[] | undefined> {
    const languages = await vscode.languages.getLanguages();
    if (!languages.includes(languageId)) {
        return undefined; // Language ID not found
    }

    // Retrieve the file associations from VSCode settings
    const associations =
        vscode.workspace.getConfiguration("files").get<{ [key: string]: string }>("associations") || {};

    // Find extensions mapped to the given languageId
    const extensions = Object.entries(associations)
        .filter(([_, lang]) => lang === languageId)
        .map(([ext]) => (ext.startsWith(".") ? ext : `.${ext}`));

    return extensions.length > 0 ? extensions : undefined;
}

// Example usage
getFileExtensions("javascript").then((extensions) => {
    console.log(extensions); // Example output: ['.js', '.mjs', '.cjs']
});

class SnippetTreeItem extends vscode.TreeItem {
    constructor(
        public readonly languageId: string,
        public readonly collapsibleState: vscode.TreeItemCollapsibleState,
        public readonly description?: string,
        public readonly command?: vscode.Command
    ) {
        super(languageId, collapsibleState);

        this.iconPath = vscode.ThemeIcon.File;

        if (collapsibleState === vscode.TreeItemCollapsibleState.None) {
            this.resourceUri = vscode.Uri.parse("file:///" + languageId + ".snippet");
            this.tooltip = languageId;
        } else {
            const extension = getExtensionFromLanguageId(languageId);

            if (!extension) {
                this.iconPath = vscode.ThemeIcon.Folder;
            }

            this.resourceUri = vscode.Uri.parse("file:///" + (extension ?? languageId));
            this.tooltip = "snippets/" + languageId + ".json";
        }

        this.description = description;
        this.command = command;
    }
}

export async function getSnippetByLanguageId(languageId: string): Promise<Snippets> {
    const snippetPath = path.join(UserPath, "snippets", languageId + ".json");

    return cjson.load(snippetPath);
}

export async function getSnippetLanguages(): Promise<string[]> {
    const snippetsPath = path.join(UserPath, "snippets");

    const files = await fs.readdir(snippetsPath);
    return files.filter((f) => f.endsWith(".json")).map((f) => f.slice(0, -5));
}

export class SnippetViewProvider implements vscode.TreeDataProvider<SnippetTreeItem> {
    private _onDidChangeTreeData: vscode.EventEmitter<SnippetTreeItem | undefined | void> = new vscode.EventEmitter<
        SnippetTreeItem | undefined | void
    >();
    readonly onDidChangeTreeData: vscode.Event<SnippetTreeItem | undefined | void> = this._onDidChangeTreeData.event;

    constructor() {}

    refresh() {
        this._onDidChangeTreeData.fire();
    }

    getTreeItem(element: SnippetTreeItem): vscode.TreeItem {
        return element;
    }

    async getChildren(element?: SnippetTreeItem): Promise<SnippetTreeItem[]> {
        if (!element) {
            const languages = await getSnippetLanguages();
            return languages.map((lang) => {
                return new SnippetTreeItem(lang, vscode.TreeItemCollapsibleState.Collapsed);
            });
        }

        if (element.collapsibleState === vscode.TreeItemCollapsibleState.None) {
            return [];
        }

        const snippets = await getSnippetByLanguageId(element.languageId);
        const snippetItems: SnippetTreeItem[] = [];

        for (const [key, value] of Object.entries(snippets)) {
            snippetItems.push(new SnippetTreeItem(key, vscode.TreeItemCollapsibleState.None, value.description));
        }

        return snippetItems;
    }

    public static activate(context: vscode.ExtensionContext) {
        const snippetDataProvider = new SnippetViewProvider();
        vscode.window.registerTreeDataProvider("snippetView", snippetDataProvider);

        registerCommandIB(
            Commands.ShowSnippetView,
            () => {
                vscode.commands.executeCommand("workbench.view.snippetContainer");
            },
            context
        );

        registerCommandIB(Commands.OpenSnippet, openSnippet, context);
        registerCommandIB(Commands.RefreshSnippetView, () => snippetDataProvider.refresh(), context);
    }
}
