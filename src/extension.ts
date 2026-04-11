import { ExtensionContext, Uri } from "vscode";
import { activateIbChatView } from "./chat/IbChatViewProvider";
import { relativeGoTo } from "./commands/relativeGoTo";
import { openPR } from "./commands/openPR";
import { pasteImage, smartPaste } from "./commands/pasteImage";
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
    registerCommandIB(Commands.OpenPR, openPR, context);
    registerCommandIB(Commands.PasteImage, pasteImage, context);
    registerCommandIB(Commands.SmartPaste, smartPaste, context);

    SnippetViewProvider.activate(context);
    activateIbChatView(context);
}

export function deactivate() {
    SnippetViewProvider.deactivate();
}
