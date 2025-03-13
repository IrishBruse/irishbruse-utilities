import path from "path";
import os from "os";
import { registerCommandIB } from "../utils/vscode";
import { getExtensionFromLanguageId, getLineCommentSyntax } from "../utils/languages";
import { Commands, Views } from "../constants";
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
} from "vscode";
import {
    getAllOpenTabUris,
    getSnippetLanguages,
    getSnippetsByLanguageId,
    isECMA,
    setSnippetsByLanguageId,
    trimStringArray,
} from "./utility";
import { readFile, writeFile } from "fs/promises";

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

                return new SnippetTreeItem(
                    languageId,
                    TreeItemCollapsibleState.Collapsed,
                    description ? description.join(",") : undefined
                );
            });
        }

        if (parent.collapsibleState === TreeItemCollapsibleState.None) {
            return [];
        }

        const snippets = await getSnippetsByLanguageId(parent.languageId);
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
                    arguments: [key, value, parent.languageId],
                })
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

        if (!group && Object.keys(group).length !== 4) {
            window.showErrorMessage("Missing group argument");
            return;
        }

        const langIds = getLanguageIdMappings();
        const languageId = langIds[group] ?? group;

        const snippetContent = await stringifySnippet(group, snippet);

        const snippetPath = path.join(snippetDir, key + "." + group + ".snippet");

        await writeFile(snippetPath, snippetContent);

        let editor = await window.showTextDocument(Uri.file(snippetPath));

        const generatedMap = getGeneratedIdMappings();
        if (generatedMap[group]) {
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
            return; // Not a snippet
        }

        const snippetPath = file.fileName;
        const snippetText = (await readFile(snippetPath)).toString();

        const fileName = path.basename(snippetPath);
        const [key, languageId] = fileName.split(".");

        const snippet = await parseSnippet(snippetText, languageId);

        if (!snippet) {
            return;
        }

        const snippets = getSnippetsByLanguageId(languageId);
        snippets[key] = snippet;
        await setSnippetsByLanguageId(languageId, snippets);

        const generatedMap = getGeneratedIdMappings();
        const reverseGeneratedMap = reverseMap(generatedMap);

        const languagesToGenerate = reverseGeneratedMap[languageId];

        if (languagesToGenerate) {
            console.log(`Languages to generate due to change in "${languageId}":`, languagesToGenerate);

            for (const dependentLanguageId of languagesToGenerate) {
                generateSnippetsForLanguage(dependentLanguageId, generatedMap[dependentLanguageId]); // Assuming you have this function
            }
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

function getLanguageIdMappings(): Record<string, string> {
    const config = workspace.getConfiguration("ib-utilities");
    return config.get("languageIdMappings") || {};
}

function getGeneratedIdMappings(): Record<string, string[]> {
    const config = workspace.getConfiguration("ib-utilities");
    const mappings: Record<string, string> = config.get("generatedLanguageMappings") ?? {};
    return Object.entries(mappings).reduce((acc, [key, value]) => {
        return {
            ...acc,
            [key]: value?.split(","),
        };
    }, {});
}

function generateSnippetsForLanguage(languageId: string, dependencies: string[]) {
    console.log(`Generating snippets for "${languageId}" using dependencies:`, dependencies);

    let generatedSnippets: Snippets = {};

    for (const depLanguage of dependencies) {
        let depSnippets = getSnippetsByLanguageId(depLanguage);

        generatedSnippets = { ...generatedSnippets, ...depSnippets };
    }

    setSnippetsByLanguageId(languageId, generatedSnippets);
}

function reverseMap(inputMap: Record<string, string[]>): Record<string, string[]> {
    const reversedMap: { [key: string]: string[] } = {};

    for (const key in inputMap) {
        if (inputMap.hasOwnProperty(key)) {
            // Ensure key is directly on the object
            const values = inputMap[key];

            values.forEach((value) => {
                const trimmedValue = value.trim();

                if (!reversedMap[trimmedValue]) {
                    reversedMap[trimmedValue] = [];
                }
                reversedMap[trimmedValue].push(key);
            });
        }
    }

    return reversedMap;
}

async function stringifySnippet(group: string, snippet: Snippet): Promise<string> {
    const lines: string[] = [];

    const l = (line: string, condition?: boolean) => {
        if (condition !== false) {
            lines.push(line);
        }
    };

    const c = await getLineCommentSyntax(group);

    const isEcma = isECMA(group);

    l(`${c} @prefix ${snippet.prefix ?? ""}`);
    l(`${c} @description ${snippet.description ?? ""}`);
    l(`${c} @isFileTemplate ${snippet.isFileTemplate ?? ""}`);
    l(`${c} @ts-nocheck`, isEcma);
    l(`${c} prettier-ignore`, isEcma);
    l(`${c} eslint-disable`, isEcma);
    l("");

    lines.push(...snippet.body);

    return lines.join("\n");
}

async function parseSnippet(snippet: string, languageId: string): Promise<Snippet | null> {
    const lines: string[] = snippet.split("\n");

    const prefixLine = lines[0];
    const descriptionLine = lines[1];
    const fileTemplateLine = lines[2];

    const c = await getLineCommentSyntax(languageId);
    if (!prefixLine.startsWith(`${c} @prefix`)) {
        window.showErrorMessage(`missing @prefix directive`);
        return null;
    }

    if (!descriptionLine.startsWith(`${c} @description`)) {
        window.showErrorMessage(`missing @description directive`);
        return null;
    }

    if (!fileTemplateLine.startsWith(`${c} @isFileTemplate`)) {
        window.showErrorMessage(`missing @isFileTemplate directive`);
        return null;
    }

    const prefix = prefixLine.slice(c.length + 8).trim();
    const description = descriptionLine.slice(c.length + 13).trim();
    const fileTemplate = fileTemplateLine.slice(c.length + 16).trim();

    let startLine = 3;
    if (lines[2] === "// @ts-nocheck") {
        startLine += 3;
    }

    const body = trimStringArray(lines.slice(startLine));

    return {
        prefix: prefix === "" ? undefined : prefix,
        description: description === "" ? undefined : description,
        isFileTemplate: fileTemplate === "" ? undefined : Boolean(fileTemplate),
        body,
    };
}
