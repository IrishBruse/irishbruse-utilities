import { ExtensionContext, Uri } from "vscode";
import { openMermaidPreview } from "./commands/openMermaidPreview";
import { openMermaidSource } from "./commands/openMermaidSource";
import { relativeGoTo } from "./commands/relativeGoTo";
import { GitHelpersViewProvider } from "./gitHelpers/GitHelpersView";
import { registerMermaidCustomEditor } from "./mermaidEditor/MermaidCustomEditorProvider";
import { SnippetViewProvider } from "./snippetEditor/SnippetView";
import { registerCommandIB } from "./utils/vscode";
import { Commands } from "./constants";

export let UserPath: string = null!;
export let SnippetsPath: string = null!;

export function activate(context: ExtensionContext) {
    const userFolderUri = Uri.joinPath(context.globalStorageUri, "../..");
    UserPath = userFolderUri.fsPath;

    const snippetsFolderUri = Uri.joinPath(userFolderUri, "snippets");
    SnippetsPath = snippetsFolderUri.fsPath;

    registerCommandIB(Commands.RelativeGoTo, relativeGoTo, context);
    registerCommandIB(Commands.OpenMermaidPreview, openMermaidPreview, context);
    registerCommandIB(Commands.OpenMermaidSource, openMermaidSource, context);

    registerMermaidCustomEditor(context);
    SnippetViewProvider.activate(context);
    GitHelpersViewProvider.activate(context);
}

export function deactivate() {
    SnippetViewProvider.deactivate();
}
