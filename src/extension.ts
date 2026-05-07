import { ExtensionContext, Uri } from "vscode";
import { registerClipboardContextSync, resetClipboardContextForShutdown } from "./clipboardContextSync";
import { clipboardHasImage } from "./commands/clipboardHasImage";
import { openPR } from "./commands/openPR";
import { relativeGoTo } from "./commands/relativeGoTo";
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

    registerClipboardContextSync(context);

    registerCommandIB(Commands.RelativeGoTo, relativeGoTo, context);
    registerCommandIB(Commands.OpenPR, openPR, context);
    registerCommandIB(Commands.ClipboardHasImage, clipboardHasImage, context);

    SnippetViewProvider.activate(context);
}

export function deactivate() {
    void resetClipboardContextForShutdown();
    SnippetViewProvider.deactivate();
}
