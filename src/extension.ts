import { ExtensionContext, Uri } from "vscode";
import { relativeGoTo } from "./commands/relativeGoTo";
import { openPR } from "./commands/openPR";
import { SnippetViewProvider } from "./snippetEditor/SnippetView";
import path from "path";
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
    registerCommandIB(Commands.OpenPR, openPR, context);

    SnippetViewProvider.activate(context);
}

export function deactivate() {
    SnippetViewProvider.deactivate();
}
