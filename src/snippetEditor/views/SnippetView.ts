import { UserPath } from "../../extension";
import path from "path";
import os from "os";
import cjson from "cjson";
import * as fs from "fs/promises";
import { registerCommandIB } from "../../utils/vscode";
import { getExtensionFromLanguageId, getLineCommentSyntax } from "../../utils/languages";
import { Commands, Views } from "../../constants";
import { mkdirSync, existsSync, rmSync, readdirSync } from "fs";
import {
    TreeItem,
    TreeItemCollapsibleState,
    Command,
    ThemeIcon,
    Uri,
    TreeDataProvider,
    Event,
    EventEmitter,
    ExtensionContext,
    window,
    commands,
    workspace,
    languages,
    TextDocument,
    TabInputText,
} from "vscode";

type Snippet = {
    key: string;
    group: string;
    prefix?: string;
    body: string[];
    isFileTemplate?: boolean;
    description?: string;
};

type Snippets = Record<string, Snippet>;

class SnippetTreeItem extends TreeItem {
    constructor(
        public readonly languageId: string,
        public readonly collapsibleState: TreeItemCollapsibleState,
        public readonly description?: string,
        public readonly iconOverride?: ThemeIcon,
        public readonly command?: Command
    ) {
        super(languageId, collapsibleState);

        if (collapsibleState === TreeItemCollapsibleState.None) {
            this.iconPath = iconOverride ?? new ThemeIcon("symbol-snippet");
            this.resourceUri = Uri.parse("file:///" + languageId + ".snippet");
            this.tooltip = languageId;
        } else {
            const extension = getExtensionFromLanguageId(languageId);

            this.iconPath = iconOverride ?? !extension ? ThemeIcon.Folder : ThemeIcon.File;

            this.resourceUri = Uri.parse("file:///" + (extension ?? languageId));
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

const snippetDir = path.join(os.tmpdir(), "ib-utilities_snippet-editor");

if (!existsSync(snippetDir)) {
    mkdirSync(snippetDir);
}

export class SnippetViewProvider implements TreeDataProvider<SnippetTreeItem> {
    private _onDidChangeTreeData: EventEmitter<SnippetTreeItem | undefined | void> = new EventEmitter<
        SnippetTreeItem | undefined | void
    >();
    readonly onDidChangeTreeData: Event<SnippetTreeItem | undefined | void> = this._onDidChangeTreeData.event;

    constructor() {}

    refresh() {
        this._onDidChangeTreeData.fire();
    }

    getTreeItem(element: SnippetTreeItem): TreeItem {
        return element;
    }

    async getChildren(parent?: SnippetTreeItem): Promise<SnippetTreeItem[]> {
        const generatedMappings = getGeneratedIdMappings();

        if (!parent) {
            const languages = await getSnippetLanguages();

            return languages.map((languageId) => {
                let description = generatedMappings[languageId];
                return new SnippetTreeItem(languageId, TreeItemCollapsibleState.Collapsed, description);
            });
        }

        if (parent.collapsibleState === TreeItemCollapsibleState.None) {
            return [];
        }

        const snippets = await getSnippetByLanguageId(parent.languageId);
        const snippetItems: SnippetTreeItem[] = [];

        const generated = generatedMappings[parent.languageId];
        if (generated) {
            const icon = !!generated ? new ThemeIcon("lock") : undefined;
            snippetItems.push(new SnippetTreeItem("Auto Generated", TreeItemCollapsibleState.None, "readonly", icon));
        }

        for (const [key, value] of Object.entries(snippets)) {
            snippetItems.push(
                new SnippetTreeItem(key, TreeItemCollapsibleState.None, value.description, undefined, {
                    title: "Open Snippet",
                    command: Commands.OpenSnippet,
                    arguments: [{ ...value, group: parent.languageId, key } as Snippet],
                })
            );
        }

        return snippetItems;
    }

    async openSnippet(snippet?: Snippet) {
        if (!snippet) {
            window.showErrorMessage("Missing snippet argument");
            return;
        }

        const { key, group } = snippet;

        const langIds = getLanguageIdMappings();
        const languageId = langIds[group] ?? group;

        const snippetContent = await stringifySnippet(snippet);

        const snippetPath = path.join(snippetDir, key + "." + group + ".snippet");

        await fs.writeFile(snippetPath, snippetContent);

        let editor = await window.showTextDocument(Uri.file(snippetPath));

        const generatedMap = getGeneratedIdMappings();
        if (generatedMap[languageId]) {
            await commands.executeCommand("workbench.action.files.setActiveEditorReadonlyInSession");
        }

        try {
            await languages.setTextDocumentLanguage(editor.document, languageId);
        } catch (error) {
            // Ignore and use plaintext
        }
    }

    async save(file: TextDocument) {
        if (file.fileName.startsWith(snippetDir) && file.fileName.endsWith(".snippet")) {
            console.log("save", file.fileName);
            const snippet = await parseSnippet(file.fileName);

            console.log(snippet);
        }
    }

    static activate(context: ExtensionContext) {
        const snippetDataProvider = new SnippetViewProvider();
        window.registerTreeDataProvider(Views.SnippetView, snippetDataProvider);

        registerCommandIB(
            Commands.ShowSnippetView,
            () => commands.executeCommand(Commands.ViewSnippetContainer),
            context
        );

        registerCommandIB(Commands.OpenSnippet, snippetDataProvider.openSnippet, context);
        registerCommandIB(Commands.RefreshSnippetView, snippetDataProvider.refresh, context);

        context.subscriptions.push(workspace.onDidSaveTextDocument(snippetDataProvider.save));
    }

    static deactivate() {
        const openFiles = getAllOpenTabUris().map((uri) => uri.path);
        const files = readdirSync(snippetDir);

        for (const file of files) {
            const fullPath = path.join(snippetDir, file);
            if (!openFiles.includes(fullPath)) {
                rmSync(fullPath);
            }
        }
    }
}

export function getAllOpenTabUris(): Uri[] {
    const tabGroups = window.tabGroups.all;
    const uris: Uri[] = [];

    for (const group of tabGroups) {
        for (const tab of group.tabs) {
            if (tab.input instanceof TabInputText) {
                uris.push(tab.input.uri);
            }
        }
    }
    return uris;
}

function getLanguageIdMappings(): Record<string, string | undefined> {
    const config = workspace.getConfiguration();
    return config.get("ib-utilities.languageIdMappings") || {};
}

function getGeneratedIdMappings(): Record<string, string | undefined> {
    const config = workspace.getConfiguration();
    return config.get("ib-utilities.generatedLanguageMappings") || {};
}

async function stringifySnippet(snippet: Snippet): Promise<string> {
    const lines: string[] = [];

    const c = await getLineCommentSyntax(snippet.group);

    lines.push(`${c} @prefix ${snippet.prefix ?? ""}`);
    lines.push(`${c} @description ${snippet.description ?? ""}`);
    if (isECMA(snippet.group)) {
        lines.push(`// @ts-nocheck`);
        lines.push(`// prettier-ignore`);
        lines.push(`// eslint-disable`);
    }
    lines.push("");
    lines.push(...snippet.body);

    return lines.join("\n");
}

async function parseSnippet(snippetPath: string): Promise<Snippet | null> {
    const snippet = (await fs.readFile(snippetPath)).toString();
    const lines: string[] = snippet.split("\n");

    const fileName = path.basename(snippetPath);
    const [key, languageId] = fileName.split(".");

    const prefixLine = lines[0];
    const descriptionLine = lines[1];

    const c = await getLineCommentSyntax(languageId);
    if (!prefixLine.startsWith(`${c} @prefix`)) {
        window.showErrorMessage(`${fileName} missing @prefix directive`);
        return null;
    }

    if (!descriptionLine.startsWith(`${c} @description`)) {
        window.showErrorMessage(`${fileName} missing @description directive`);
        return null;
    }

    const prefix = prefixLine.slice(10).trim();
    const description = descriptionLine.slice(15).trim();

    let startLine = 4;
    if (lines[3] === "// @ts-nocheck") {
        startLine += 3;
    }

    const body = lines.slice(startLine);

    return {
        key,
        prefix: prefix === "" ? undefined : prefix,
        description: description === "" ? undefined : description,
        group: languageId,
        isFileTemplate: false,
        body,
    };
}

function isECMA(languageId: string) {
    return (
        languageId === "typescript" ||
        languageId === "typescriptreact" ||
        languageId === "javascript" ||
        languageId === "javascriptreact"
    );
}
